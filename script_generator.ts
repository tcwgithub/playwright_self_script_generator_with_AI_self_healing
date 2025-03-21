import { chromium, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as testData from '../fikahq/test.data.json';
import * as templateData from './script_template.json';

dotenv.config();

function normalizeFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/\s+/g, '_');
}

async function main() {
  const browser = await chromium.launch({ headless: true }); 
  const page: Page = await browser.newPage();

  try {
    const url: string = process.env.FSIGNUP || '';
    console.log(`Navigating to: ${url}`);
    await page.goto(url);

    const inputs = await page.$$('input, select');
    console.log(`Found ${inputs.length} input/select elements.`);

    let generatedCode: string = '';
    generatedCode += templateData.imports + '\n';
    generatedCode += templateData.testHeader + '\n';
    generatedCode += templateData.browserLaunch + '\n';
    generatedCode += templateData.gotoUrl.replace('{{url}}', url) + '\n\n';
    generatedCode += templateData.interactionsStart + '\n';

    // Loop through all input/select elements
    for (const input of inputs) {
      const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      const label = await page.$(`label[for="${id}"]`);

      // Determine the field name based on available attributes
      let fieldName: string = '';
      if (id) {
        fieldName = normalizeFieldName(id);
      } else if (name) {
        fieldName = normalizeFieldName(name);
      } else if (placeholder) {
        fieldName = normalizeFieldName(placeholder);
      } else if (label) {
        fieldName = normalizeFieldName(await label.innerText());
      }

      if (!fieldName) {
        continue;
      }
      const fieldValue = testData[fieldName] || '';

      let selector: string = '';
      if (id) {
        selector = `#${id}`;
      } else if (name) {
        selector = `input[name="${name}"], select[name="${name}"]`;
      } else if (placeholder) {
        selector = `input[placeholder="${placeholder}"]`;
      } else if (label) {
        selector = `input[id="${await label.getAttribute('for')}"]`;
      }

      // Generate code based on element type
      if (tagName === 'input') {
        generatedCode += templateData.fillInput.replace('{{selector}}', selector).replace('{{value}}', fieldValue) + '\n';
      } else if (tagName === 'select') {
        generatedCode += templateData.selectOption.replace('{{selector}}', selector).replace('{{value}}', fieldValue) + '\n';
      }
    }

    generatedCode += '\n' + templateData.submitButton + '\n\n';
    generatedCode += templateData.catchBlock + '\n';
    generatedCode += templateData.testFooter + '\n';

    // Save the generated script to a file
    const generatedScriptPath = path.join(__dirname, '../fikahq/tests/automated_script.spec.ts');
    await fs.writeFile(generatedScriptPath, generatedCode);
    console.log('Automated Script Generated > automated_script.spec.ts');

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await browser.close();
  }
}

main();