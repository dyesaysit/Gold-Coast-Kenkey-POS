/* Direct A4 Inventory Report PDF download. Runs locally without a popup. */
(function (global) {
  "use strict";

  function ascii(value) {
    return String(value == null ? "" : value).replace(/[^ -~]/g, "-");
  }

  function escapePdf(value) {
    return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function wrap(value, width) {
    var words = ascii(value).split(/\s+/);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + " " + words[i] : words[i];
      if (next.length > width && line) { lines.push(line); line = words[i]; }
      else { line = next; }
    }
    if (line) { lines.push(line); }
    return lines.length ? lines : [""];
  }

  function bytes(value) {
    var result = new Uint8Array(value.length);
    for (var i = 0; i < value.length; i++) { result[i] = value.charCodeAt(i) & 255; }
    return result;
  }

  function join(parts) {
    var length = parts.reduce(function (total, part) { return total + part.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    for (var i = 0; i < parts.length; i++) { result.set(parts[i], offset); offset += parts[i].length; }
    return result;
  }

  function jpegBytes(dataUrl) {
    var match = /^data:image\/jpeg;base64,(.+)$/i.exec(dataUrl || "");
    if (!match) { return null; }
    try {
      var binary = atob(match[1]);
      var result = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) { result[i] = binary.charCodeAt(i); }
      return result;
    } catch (error) { return null; }
  }

  function buildLines(summary, products, settings, generated, context) {
    var lines = ["# " + (settings.businessName || "Business Report")];
    if (settings.phone) { lines.push("Telephone: " + settings.phone); }
    if (settings.address) { lines = lines.concat(wrap("Address: " + settings.address, 82)); }
    lines.push("", "# Inventory Report", generated, context, "", "# Summary");
    lines.push("Total inventory products: " + summary.totalProducts);
    lines.push("Total units currently in stock: " + summary.totalUnits);
    lines.push("Low-stock products: " + summary.lowStockCount);
    lines.push("Out-of-stock products: " + summary.outOfStockCount);
    lines.push("", "# Filtered inventory");
    if (!products.length) { lines.push("No inventory products match this filter."); }
    for (var i = 0; i < products.length; i++) {
      var product = products[i];
      var status = product.status === "out" ? "Out of Stock" : product.status === "low" ? "Low Stock" : "In Stock";
      lines = lines.concat(wrap(product.name + " | Stock: " + product.stockQuantity +
        " | Low at: " + product.lowStockLevel + " | " + status, 82));
    }
    return lines;
  }

  function createPdf(summary, products, settings, generated, context) {
    var lines = buildLines(summary, products, settings, generated, context);
    var pages = [];
    while (lines.length) { pages.push(lines.splice(0, 46)); }
    var logo = jpegBytes(settings.logo);
    var objects = [];
    var firstPageRef = logo ? 5 : 4;
    var pageRefs = [];
    objects[1] = bytes("<< /Type /Catalog /Pages 2 0 R >>");
    objects[3] = bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    if (logo) {
      objects[4] = join([bytes("<< /Type /XObject /Subtype /Image /Width 600 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + logo.length + " >>\nstream\n"), logo, bytes("\nendstream")]);
    }
    for (var pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      var pageRef = firstPageRef + pageIndex * 2;
      var contentRef = pageRef + 1;
      pageRefs.push(pageRef + " 0 R");
      var resources = "<< /Font << /F1 3 0 R >>" + (logo && pageIndex === 0 ? " /XObject << /Logo 4 0 R >>" : "") + " >>";
      objects[pageRef] = bytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources " + resources + " /Contents " + contentRef + " 0 R >>");
      var commands = [];
      if (logo && pageIndex === 0) { commands.push("q 58 0 0 58 268 770 cm /Logo Do Q"); }
      var y = logo && pageIndex === 0 ? 748 : 800;
      for (var lineIndex = 0; lineIndex < pages[pageIndex].length; lineIndex++) {
        var line = pages[pageIndex][lineIndex];
        var heading = line.indexOf("# ") === 0;
        commands.push("BT /F1 " + (heading ? 14 : 10) + " Tf 50 " + y + " Td (" + escapePdf(heading ? line.slice(2) : line) + ") Tj ET");
        y -= heading ? 21 : 15;
      }
      var stream = commands.join("\n");
      objects[contentRef] = bytes("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    }
    objects[2] = bytes("<< /Type /Pages /Count " + pages.length + " /Kids [" + pageRefs.join(" ") + "] >>");
    var output = [bytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    var offsets = [0];
    var position = output[0].length;
    for (var ref = 1; ref < objects.length; ref++) {
      offsets[ref] = position;
      var object = join([bytes(ref + " 0 obj\n"), objects[ref], bytes("\nendobj\n")]);
      output.push(object); position += object.length;
    }
    var xrefPosition = position;
    var xref = "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
    for (var offsetIndex = 1; offsetIndex < objects.length; offsetIndex++) {
      xref += String(offsets[offsetIndex]).padStart(10, "0") + " 00000 n \n";
    }
    xref += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xrefPosition + "\n%%EOF";
    output.push(bytes(xref));
    return new Blob(output, { type: "application/pdf" });
  }

  global.GCK = global.GCK || {};
  global.GCK.inventoryReportPdf = { createPdf: createPdf };
})(window);
