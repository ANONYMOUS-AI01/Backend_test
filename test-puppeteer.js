import puppeteer from 'puppeteer';
import fs from 'fs/promises';

async function generateTestPDF() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent('<h1>Hello, PDF!</h1>', { waitUntil: 'load', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await fs.writeFile('test_output.pdf', pdfBuffer);
    console.log('PDF saved at: test_output.pdf');
    console.log('Buffer Size:', pdfBuffer.length);

    await browser.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

generateTestPDF();