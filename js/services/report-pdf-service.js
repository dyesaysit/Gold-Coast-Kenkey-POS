/* Direct A4 PDF export for Reports. Generates a small PDF locally and never
 * opens a tab, popup, print dialog, or network connection. */
(function (global) {
  "use strict";

  function ascii(value) {
    return String(value == null ? "" : value)
      .replace(/GH₵/g, "GHC ")
      .replace(/[—–]/g, "-")
      .replace(/[•·]/g, "-")
      .replace(/[^ -~]/g, "?");
  }

  function escapePdf(value) {
    return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function wrap(value, width) {
    var words = ascii(value).split(/\s+/);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var candidate = line ? line + " " + words[i] : words[i];
      if (candidate.length > width && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = candidate;
      }
    }
    if (line) { lines.push(line); }
    return lines.length ? lines : [""];
  }

  function addWrapped(lines, text, width, prefix) {
    var wrapped = wrap(text, width);
    for (var i = 0; i < wrapped.length; i++) {
      lines.push((i === 0 ? prefix || "" : "  ") + wrapped[i]);
    }
  }

  function getJpegBytes(dataUrl) {
    var match = /^data:image\/jpeg;base64,(.+)$/i.exec(dataUrl || "");
    if (!match) { return null; }
    try {
      var binary = atob(match[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
      return bytes;
    } catch (error) {
      return null;
    }
  }

  function buildLines(summary, settings, periodTitle, generatedText, formatMoney) {
    var lines = [];
    lines.push("# " + (settings.businessName || "Business Report"));
    if (settings.phone) { lines.push("Telephone: " + settings.phone); }
    if (settings.address) { addWrapped(lines, "Address: " + settings.address, 82); }
    lines.push("");
    lines.push("# " + periodTitle);
    lines.push(generatedText);
    lines.push("");
    lines.push("# Summary");
    lines.push("Total sales revenue: " + formatMoney(summary.totalRevenue));
    lines.push("Completed transactions: " + summary.transactionCount);
    lines.push("Cash sales: " + formatMoney(summary.cashTotal));
    lines.push("MoMo sales: " + formatMoney(summary.momoTotal));
    lines.push("Best-selling item: " + (summary.bestSeller
      ? summary.bestSeller.name + " (" + summary.bestSeller.quantity + " sold)"
      : "No items sold"));
    lines.push("");
    lines.push("# Products and meals sold");
    if (!summary.productsSold.length) { lines.push("No products or meals were sold in this period."); }
    for (var i = 0; i < summary.productsSold.length; i++) {
      addWrapped(lines, summary.productsSold[i].name + " - " + summary.productsSold[i].quantity + " sold", 82, "- ");
    }
    lines.push("");
    lines.push("# Low-stock products");
    if (!summary.lowStockProducts.length) { lines.push("No products are currently low in stock."); }
    for (var j = 0; j < summary.lowStockProducts.length; j++) {
      var product = summary.lowStockProducts[j];
      addWrapped(lines, (product.name || "Unnamed product") + " - Stock " + product.stockQuantity + ", low at " + product.lowStockLevel, 82, "- ");
    }
    return lines;
  }

  function stringBytes(value) {
    var bytes = new Uint8Array(value.length);
    for (var i = 0; i < value.length; i++) { bytes[i] = value.charCodeAt(i) & 255; }
    return bytes;
  }

  function joinBytes(parts) {
    var length = parts.reduce(function (total, part) { return total + part.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    for (var i = 0; i < parts.length; i++) { result.set(parts[i], offset); offset += parts[i].length; }
    return result;
  }

  function createPdf(summary, settings, periodTitle, generatedText, formatMoney) {
    var lines = buildLines(summary, settings, periodTitle, generatedText, formatMoney);
    var pages = [];
    while (lines.length) { pages.push(lines.splice(0, 46)); }
    if (!pages.length) { pages.push([]); }
    var jpeg = getJpegBytes(settings.logo);
    var objects = [];
    var imageRef = jpeg ? 4 : 0;
    var firstPageRef = jpeg ? 5 : 4;
    var pageRefs = [];

    objects[1] = stringBytes("<< /Type /Catalog /Pages 2 0 R >>");
    objects[3] = stringBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    if (jpeg) {
      objects[4] = joinBytes([
        stringBytes("<< /Type /XObject /Subtype /Image /Width 600 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n"),
        jpeg,
        stringBytes("\nendstream")
      ]);
    }

    for (var pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      var pageRef = firstPageRef + pageIndex * 2;
      var contentRef = pageRef + 1;
      pageRefs.push(pageRef + " 0 R");
      var resources = "<< /Font << /F1 3 0 R >>" + (jpeg && pageIndex === 0 ? " /XObject << /Logo " + imageRef + " 0 R >>" : "") + " >>";
      objects[pageRef] = stringBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources " + resources + " /Contents " + contentRef + " 0 R >>");
      var commands = [];
      if (jpeg && pageIndex === 0) { commands.push("q 58 0 0 58 268 770 cm /Logo Do Q"); }
      var y = jpeg && pageIndex === 0 ? 748 : 800;
      for (var lineIndex = 0; lineIndex < pages[pageIndex].length; lineIndex++) {
        var line = pages[pageIndex][lineIndex];
        var heading = line.indexOf("# ") === 0;
        var text = heading ? line.slice(2) : line;
        var size = heading ? 14 : 10;
        commands.push("BT /F1 " + size + " Tf 50 " + y + " Td (" + escapePdf(text) + ") Tj ET");
        y -= heading ? 21 : 15;
      }
      commands.push("BT /F1 8 Tf 500 25 Td (Page " + (pageIndex + 1) + " of " + pages.length + ") Tj ET");
      var stream = commands.join("\n");
      objects[contentRef] = stringBytes("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    }
    objects[2] = stringBytes("<< /Type /Pages /Count " + pages.length + " /Kids [" + pageRefs.join(" ") + "] >>");

    var output = [stringBytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    var offsets = [0];
    var position = output[0].length;
    for (var ref = 1; ref < objects.length; ref++) {
      offsets[ref] = position;
      var objectBytes = joinBytes([stringBytes(ref + " 0 obj\n"), objects[ref], stringBytes("\nendobj\n")]);
      output.push(objectBytes);
      position += objectBytes.length;
    }
    var xrefPosition = position;
    var xref = "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
    for (var offsetIndex = 1; offsetIndex < objects.length; offsetIndex++) {
      xref += String(offsets[offsetIndex]).padStart(10, "0") + " 00000 n \n";
    }
    xref += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xrefPosition + "\n%%EOF";
    output.push(stringBytes(xref));
    return new Blob(output, { type: "application/pdf" });
  }

  global.GCK = global.GCK || {};
  global.GCK.reportPdf = { createPdf: createPdf };
})(window);
