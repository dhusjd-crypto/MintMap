import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("tests/e2e/fixtures/generated");
mkdirSync(output, { recursive: true });

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBytes = Buffer.from(type, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([header, typeBytes, data, checksum]);
};

const GLYPHS = {
  " ": ["000", "000", "000", "000", "000", "000", "000"],
  ".": ["000", "000", "000", "000", "000", "110", "110"],
  ",": ["000", "000", "000", "000", "110", "110", "100"],
  ":": ["000", "110", "110", "000", "110", "110", "000"],
  0: ["111", "101", "101", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "010", "010", "111"],
  2: ["111", "001", "001", "111", "100", "100", "111"],
  3: ["111", "001", "001", "111", "001", "001", "111"],
  4: ["101", "101", "101", "111", "001", "001", "001"],
  5: ["111", "100", "100", "111", "001", "001", "111"],
  6: ["111", "100", "100", "111", "101", "101", "111"],
  7: ["111", "001", "001", "010", "010", "010", "010"],
  8: ["111", "101", "101", "111", "101", "101", "111"],
  9: ["111", "101", "101", "111", "001", "001", "111"],
  A: ["010", "101", "101", "111", "101", "101", "101"],
  B: ["110", "101", "101", "110", "101", "101", "110"],
  C: ["111", "100", "100", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "101", "101", "110"],
  E: ["111", "100", "100", "110", "100", "100", "111"],
  F: ["111", "100", "100", "110", "100", "100", "100"],
  G: ["111", "100", "100", "101", "101", "101", "111"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  L: ["100", "100", "100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101", "101", "101"],
  N: ["101", "111", "111", "111", "111", "111", "101"],
  P: ["111", "101", "101", "111", "100", "100", "100"],
  R: ["110", "101", "101", "110", "101", "101", "101"],
  S: ["111", "100", "100", "111", "001", "001", "111"],
  T: ["111", "010", "010", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "101", "101", "111"],
  W: ["101", "101", "101", "101", "111", "111", "101"],
  Y: ["101", "101", "010", "010", "010", "010", "010"],
};

const statementLines = [
  "STATEMENT DATE: 01.08.2026",
  "DUE DATE: 25.08.2026",
  "NEW BALANCE: 87.450,37 TRY",
  "MINIMUM PAYMENT: 17.490,07 TRY",
];

const createRaster = (lines = statementLines) => {
  const scale = 5;
  const width = 900;
  const height = 300;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const rgb = Buffer.alloc(width * height * 3, 255);
  const setPixel = (x, y, value) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const rgbaOffset = (y * width + x) * 4;
    const rgbOffset = (y * width + x) * 3;
    rgba[rgbaOffset] = rgba[rgbaOffset + 1] = rgba[rgbaOffset + 2] = value;
    rgba[rgbaOffset + 3] = 255;
    rgb[rgbOffset] = rgb[rgbOffset + 1] = rgb[rgbOffset + 2] = value;
  };
  lines.forEach((line, lineIndex) => {
    let x = 30;
    const y = 30 + lineIndex * 65;
    for (const char of line) {
      const glyph = GLYPHS[char] ?? GLYPHS[" "];
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((pixel, columnIndex) => {
          if (pixel !== "1") return;
          for (let dy = 0; dy < scale; dy += 1)
            for (let dx = 0; dx < scale; dx += 1)
              setPixel(x + columnIndex * scale + dx, y + rowIndex * scale + dy, 20);
        });
      });
      x += 4 * scale;
    }
  });
  return { width, height, rgba, rgb };
};

const createPng = (raster = createRaster()) => {
  const { width, height, rgba } = raster;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      const source = (y * width + x) * 4;
      rgba.copy(pixels, offset, source, source + 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const createScannedPdf = (raster) => {
  const image = deflateSync(raster.rgb);
  const stream = "q 540 180 0 0 36 576 cm /Im1 Do Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${raster.width} /Height ${raster.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n${image.toString("binary")}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1)
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const createPdf = (text) => {
  const stream = `BT /F1 15 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1)
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
};

const statementRaster = createRaster();
writeFileSync(resolve(output, "statement-screenshot.png"), createPng(statementRaster));
writeFileSync(resolve(output, "statement-scanned.pdf"), createScannedPdf(statementRaster));
writeFileSync(
  resolve(output, "statement-embedded-text.pdf"),
  createPdf(
    "Statement Date: 01.08.2026  Due Date: 25.08.2026  New Balance: 87.450,37 TRY  Minimum Payment: 17.490,07 TRY",
  ),
);
writeFileSync(
  resolve(output, "payment-receipt.png"),
  createPng(
    createRaster([
      "PAYMENT DATE: 14.08.2026",
      "PAYMENT AMOUNT: 1.000,00 TRY",
      "REFERENCE: TEST-RECEIPT-001",
    ]),
  ),
);
