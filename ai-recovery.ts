import { Page } from 'playwright';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://openrouter.ai/api/v1';
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

interface OpenRouterResponse {
  choices: { 
    message?: { content: string }; 
    text?: string;
  }[];
}

async function getAlternativeLocator(page: Page, brokenLocator: string) {
  try {
    // Extract only relevant elements to reduce token usage
    const pageContent = await page.locator('input, button').evaluateAll(nodes => 
      nodes.map(n => n.outerHTML).join('\n')
    );    

    // AI Prompt
    const prompt = `Suggest a stable Playwright locator to replace "${brokenLocator}". 
                    Prioritize 'data-testid', 'id', or 'name'. If none exist, use CSS or XPath. 
                    Return only the locator string, without explanations, formatting, or extra text.

                    Example output:
                    [data-test="first-name"]

    HTML:\n\n${pageContent}`;

    const response = await axiosInstance.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You provide stable Playwright locators for missing elements.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
    });

    const data = response.data as OpenRouterResponse;
   // console.log('Full AI Response:', JSON.stringify(data, null, 2));
    const responseText = data.choices?.[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error('AI response is empty.');
    }

    const cleanedLocator = responseText.replace(/```[a-zA-Z]*\n([\s\S]*?)\n```/g, '$1').trim();
    const newLocator = cleanedLocator.split('\n')[0].trim(); // Take first line in case of multi-line response

    if (!newLocator.startsWith('[') && !newLocator.startsWith('#') && !newLocator.startsWith('.')) {
      throw new Error(`AI response did not include a valid locator: "${newLocator}"\n`);
    }

    return newLocator;

  } catch (error) {
      console.error('Error fetching alternative locator:', error);
      throw error;
  }
}

async function isElementAvailable(page: Page, selector: string) {
  //await page.waitForTimeout(3000);
  const locator = page.locator(selector); 
  const count = await locator.count();
  return count > 0;
}


export async function clickWithAIRecovery(page: Page, selector: string) {
  if (await isElementAvailable(page, selector)) {
    await page.click(selector);
  } else {
    console.warn(`Invalid Locator Found: ${selector}. Trying AI recovery...`);
    
    const newLocator = await getAlternativeLocator(page, selector);
    console.log(`Replacing locator using AI : "${selector}" → "${newLocator}"\n`);

    await page.waitForTimeout(3000);

    if (await isElementAvailable(page, newLocator)) {
     // console.log(`Using AI-suggested locator: ${newLocator}`);
      await page.click(newLocator);
    } else {
      throw new Error(`AI-suggested locator "${newLocator}" also not found.`);
    }
  }
}

export async function fillWithAIRecovery(page: Page, selector: string, value: string) {
  if (await isElementAvailable(page, selector)) {
    await page.fill(selector, value);
  } else {
    console.warn(`Invalid Locator Found: ${selector}. Trying AI recovery...`);
    
    const newLocator = await getAlternativeLocator(page, selector);
    console.log(`Replacing locator using AI : "${selector}" → "${newLocator}"\n`); 

    //await page.waitForTimeout(8000);

    if (await isElementAvailable(page, newLocator)) {
     // console.log(`Using AI-suggested locator: ${newLocator}`);
      await page.fill(newLocator, value);
    } else {
      throw new Error(`AI-suggested locator "${newLocator}" also not found.`);
    }
  }
}



