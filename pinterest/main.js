import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import ytdl from 'ytdl-core';





const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var profile_url = 'https://www.pinterest.com/divya586/'


function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  } 


async function downloadFile(fileUrl, savePath) {
    try {
      const response = await axios.get(fileUrl, { responseType: 'stream' });
  
      if (response.status !== 200) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      const directoryPath = path.dirname(savePath);
  
      if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
      }
  
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);
  
      writer.on('finish', () => {
        console.log('File downloaded successfully.');
      });
  
      writer.on('error', (err) => {
        console.error('Error while downloading file:', err);
      });
    } catch (error) {
      console.error('Error while fetching file:', error);
    }
  }


function normalizeDate(datePublished) {
  return datePublished.substring(0, 10); 
}

async function getInnerPin(page,pin_links,post_idx,total_pin_board_names,specified_year){
  for(const pin of pin_links){
    let data = {
        pin_board_names: total_pin_board_names,
        pin_profile_name: '',
        pin_headline: '',
        pin_description: '',
        pin_image_url: '',
        pin_url: '',
        pin_date: '',

    }

    await page.goto(pin);

    await page.waitForXPath("//script[@data-test-id='leaf-snippet']");
    try{
      let pin_description_el = await page.$("div[data-test-id='main-pin-description-text']");
      let pin_description = await page.evaluate((el=>el.textContent.trim()),pin_description_el);
      data.pin_description = pin_description;
    }catch(e){
      console.log('no desc')
    }
    let data_el = await page.$x("//script[@data-test-id='leaf-snippet']");
    data_el = data_el[0];
    let jsonString = await page.evaluate((el=>el.textContent.trim()),data_el);
    let jsonData = JSON.parse(jsonString);
    data.pin_profile_name = jsonData.author.name;
    data.pin_headline = jsonData.headline;
    data.pin_image_url = jsonData.image;
    data.pin_url = jsonData.sharedContent.url;
    data.pin_date = normalizeDate(jsonData.datePublished);

    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.pin_date);
    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      continue;
    } else {    
      if (data.pin_image_url != '') {         
          let image_path = `./output/${data.pin_profile_name}/pin_${post_idx}/image.jpg`;            
          let image_local = image_path;
          await downloadFile(data.pin_image_url, image_path);  
          data.image_local = image_local;
      }
      // axios.post(webhookUrl, data)
      //   .then(function (response) {
      //     console.log('Data sent to webhook successfully:', response.data);
      //   })
      //   .catch(function (error) {
      //     console.error('Error sending data to webhook:', error);
      //   });
      post_idx++;
      console.log(data);
    }
  }
}

async function scrapePins(page,specified_year){
  let total_pins_link = [];
  let total_pin_board_names = [];

  for (let idx = 0; idx < 10; idx++) {
    let pin_link = [];
    let pin_board_names = [];

    await delay(500);

    // await page.waitForXPath("//div[@id='profileBoardsFeed']/div/div/div/div/a");

    pin_link = await page.$x("//div[@id='profileBoardsFeed']/div/div/div/div/a");
    pin_board_names = await page.$x("//div[@id='profileBoardsFeed']/div/div/div/div/a/div/div/div[2]/div[1]/div");
    let link_idx = 0;
    for (let link of pin_link) {
      try {
        total_pins_link.push("https://www.pinterest.com" + await page.evaluate((el => el.getAttribute('href')), link));
        total_pin_board_names.push(await page.evaluate((el => el.textContent.trim()), pin_board_names[link_idx]));
        link_idx++;
      } catch (e) {
        console.log("No link");
      }
    }
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  }

  total_pins_link = new Set(total_pins_link);
  total_pin_board_names = new Set(total_pin_board_names);
  total_pins_link = Array.from(total_pins_link);
  total_pin_board_names = Array.from(total_pin_board_names);

  console.log(total_pins_link.length);
  console.log(total_pin_board_names.length);

  for(const pin_board_link of total_pins_link){
    let post_idx = 1;
    await page.goto(pin_board_link);

    await page.waitForXPath("//div[@data-test-id='pin']");

    let pin_links_length = await page.$x("//div[@data-test-id='pin']").length;

    if(pin_links_length > 10){
      let pin_links = [];
      for (let idx = 0; idx < 200; idx++) {
          await page.waitForXPath("(//div[@data-test-id='MobileFeed'])[1]/div[2]/div/div/div/div[1]/div/div/div/div/div/div[1]/a");
          let pins_elements = await page.$x("(//div[@data-test-id='MobileFeed'])[1]/div[2]/div/div/div/div[1]/div/div/div/div/div/div[1]/a");
          for(const pin_el of pins_elements){
            let pin = "https://www.pinterest.com" + await page.evaluate((el=>el.getAttribute('href')),pin_el);
            pin_links.push(pin); 
          }
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");
      }

      pin_links = new Set(pin_links);
      pin_links = Array.from(pin_links);
      console.log(pin_links.length);

      await getInnerPin(page,pin_links,post_idx,total_pin_board_names,specified_year);
     
      

    }else{
      let pin_links = [];
      await page.waitForXPath("(//div[@data-test-id='MobileFeed'])[1]/div[2]/div/div/div/div[1]/div/div/div/div/div/div[1]/a");
      let pins_elements = await page.$x("(//div[@data-test-id='MobileFeed'])[1]/div[2]/div/div/div/div[1]/div/div/div/div/div/div[1]/a");
      for(const pin_el of pins_elements){
        let pin = "https://www.pinterest.com" + await page.evaluate((el=>el.getAttribute('href')),pin_el);
        pin_links.push(pin); 
      }

      await getInnerPin(page,pin_links,post_idx,total_pin_board_names,specified_year);
    }    

  }

}


const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );
    
    await delay(2000);
   
    await scrapePins(page,specified_year);

  },
  useSessionPool: true,
  retryOnBlocked: true,
  requestHandlerTimeoutSecs: 999999,
  maxRequestRetries: 1,
  launchContext: {
    launcher: puppeteerExtra,
    launchOptions: {
      protocolTimeout: 999999,
      headless: false,
      args: ['--disable-notifications','--no-sandbox'],
      defaultViewport: null,
    },
  },
});



await crawler.run([profile_url]);