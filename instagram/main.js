import dotenv from 'dotenv';
import axios from 'axios';
import fs, { link } from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';


const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var login_url = 'https://www.instagram.com/accounts/login/'
var profile_url = 'https://www.instagram.com/emmachamberlain/';


const credentials = JSON.parse(fs.readFileSync('credentials.json'));
let lastUsedCredentialIndex = 0;

if (fs.existsSync('lastUsedCredentialIndex.json')) {
  lastUsedCredentialIndex = parseInt(fs.readFileSync('lastUsedCredentialIndex.json'));
}

function resetCredentialIndex() {
  lastUsedCredentialIndex = 0;
  fs.unlinkSync('lastUsedCredentialIndex.json');
}

function getNextCredentials() {
  if (lastUsedCredentialIndex < credentials.length) {
    const { email, password, username } = credentials[lastUsedCredentialIndex];
    lastUsedCredentialIndex++;
    fs.writeFileSync('lastUsedCredentialIndex.json', lastUsedCredentialIndex.toString());
    return { email, password, username };
  } else {
    console.log("All credential pairs have been tried.");
    resetCredentialIndex(); 
    return getNextCredentials(); 
  }
}



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


async function getProfilePicture(page){
  await page.waitForXPath("//canvas/parent::div/span/img");
  let profile_picture_el = await page.$x("//canvas/parent::div/span/img");
  profile_picture_el = profile_picture_el[0];
  let profile_picture = await page.evaluate((el=>el.getAttribute("src")),profile_picture_el);
  return profile_picture;
}

async function getFollowedAccounts(page){
  await page.waitForSelector("ul>li:nth-child(3)>a");
  let form = await page.$("ul>li:nth-child(3)>a");
  await form.evaluate((form=>form.click()));
  
  let total_followed_accounts = [];
  for(let idx=0;idx<20;idx++){      
    let followed_account= [];

    await delay(500);
    
    await page.waitForXPath("//div[@class='_aano']/div[1]/div/div/div/div/div/div[2]/div/div/div/a/div/div");
     
    followed_account = await page.$x("//div[@class='_aano']/div[1]/div/div/div/div/div/div[2]/div/div/div/a/div/div/span");
       
    for (let link of followed_account){
      try{total_followed_accounts.push(await page.evaluate((el=>el.textContent.trim()),link));}catch(e){console.log("no follower");}   
    }
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");     
  }

  total_followed_accounts = new Set(total_followed_accounts);
  return Array.from(total_followed_accounts);
}

async function loginToInstagram(page){
    
    await page.waitForSelector("input[name='username']");
    const newCredentials = getNextCredentials();
    if (newCredentials) {
      const { email, password, username } = newCredentials;
      await page.type("input[name='username']", email);

      await page.type("input[name='password']",password);
      
      let form = await page.$("button[type='submit']");
      await form.evaluate((form=>form.click()));
      await delay(2000);

     
    } else {
      console.log("No more credentials to try. Exiting.");
    } 

}

async function scrapeInstagramPosts(page, specified_year, total_insta_links, webhookUrl, profile_url, profile_picture, followed_accounts) {
  for (let idx = 0; idx < 5; idx++) {

    let insta_link = [];

    await delay(1000);

    await page.waitForXPath("//div/article/div[1]/div/div/div/a");

    insta_link = await page.$x("//div/article/div[1]/div/div/div/a");

    for (let link of insta_link) {
      try {
        total_insta_links.push("https://www.instagram.com" + await page.evaluate((el => el.getAttribute('href')), link));
      } catch (e) {
        console.log("No link");
      }
    }
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  }

  total_insta_links = new Set(total_insta_links);
  console.log(total_insta_links.size);
  profile_url = profile_url.split("/")[3]
  let post_idx = 1;
  for(let postUrl of total_insta_links){
    let data = {  
      post_text: '',
      post_user: '',
      post_link: postUrl,
      post_date: '',
      post_video_urls: [],
      post_image_urls: [],
      profile_picture: profile_picture,
      followed_accounts: followed_accounts
    }
    let total_img_urls = [];
    let total_video_urls = [];
    await page.goto(postUrl);
    let nextButtonFlag = true;

    while(nextButtonFlag){
      try{
        await page.waitForSelector("li>div>div>div>div>div>img");
        let image_url_elements = await page.$$("li>div>div>div>div>div>img");
        for(let image_el of image_url_elements){
          let image_url = await page.evaluate((el=>el.getAttribute('src')),image_el);
          total_img_urls.push(image_url);
        }

  
      }catch(e){
        console.log('no image');
      }
 
      await delay(500);

      try{
        let video_url_el = await page.$$("video");
        for(let video_el of video_url_el){
          let video_url = await page.evaluate((el=>el.getAttribute('src')),video_el);
          total_video_urls.push(video_url);
        }

        
      }catch(e){
        console.log('no video')
      }  
      
      try{

        let form = await page.$("button[aria-label='Next']");
        await form.evaluate((form=>form.click()));
        nextButtonFlag = true;

      }catch(e){
        nextButtonFlag = false;
        break;
      }

    }
    total_img_urls = new Set(total_img_urls);
    total_img_urls = Array.from(total_img_urls);
    console.log(total_img_urls);

    total_video_urls = new Set(total_video_urls);
    total_video_urls = Array.from(total_video_urls);
    console.log(total_video_urls);

    let post_text_el;
    let post_text;
    
    try{
      post_text_el = await page.$x("//div/a/following-sibling::span[2]");
      post_text_el = post_text_el[0];
      post_text = await page.evaluate((el=>el.textContent.trim()),post_text_el);
    }catch(e){
      post_text = '';
    }

    let post_date_el = await page.$("time");
    let post_date = await page.evaluate((el=>el.getAttribute('datetime')),post_date_el);
    post_date = normalizeDate(post_date);
    
    
    
    data.post_text = post_text;
    data.post_image_urls = total_img_urls;
    data.post_video_urls = total_video_urls;
    data.post_date = post_date;
    data.post_user = profile_url;

    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.date);
    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      continue;
    } else {
      if (data.post_video_urls != []) {
        let video_idx = 1;
        let video_local = [];
        for (const video of data.post_video_urls) {
        let video_path = `./output/${data.post_user}/post_${post_idx}/video${video_idx}.mp4`;      
          
        video_local.push(video_path);
        await downloadFile(video, video_path);
        video_idx++;
        }
        data.video_local = video_local;
      }
      if (data.post_image_urls != []) {
        let image_idx = 1;
        let image_local = [];
        for (const image of data.post_image_urls) {
          let image_path;
       
          image_path = `./output/${data.post_user}/post_${post_idx}/image${image_idx}.jpg`;          

          image_local.push(image_path);
          await downloadFile(image, image_path);
          image_idx++;
        }
        data.image_local = image_local;
      }
    } 




    // axios.post(webhookUrl, data)
    // .then(function (response) {
    //   console.log('Data sent to webhook successfully:', response.data);
    // })
    // .catch(function (error) {
    //   console.error('Error sending data to webhook:', error);
    // });
    post_idx++;
    console.log(data);
    

  }
 
}


const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 13; SM-S908U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36'
    );

    await loginToInstagram(page);
    await delay(4000);
    await page.goto(profile_url);
    await delay(4000);

    

    let profile_picture = await getProfilePicture(page);

    let total_insta_links = [];

    let page2 = await page.browser().newPage();
    await page2.setUserAgent(
      'Mozilla/5.0 (Linux; Android 13; SM-S908U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36'
    );
    await page2.goto(profile_url);
    let followed_accounts = await getFollowedAccounts(page2); 
    await page2.close();

    await scrapeInstagramPosts(page,specified_year,total_insta_links,webhookUrl,profile_url,profile_picture,followed_accounts);
    


    
    await delay(100000);
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
      args: ['--disable-notifications'],
      defaultViewport: null,
    },
  },
});



await crawler.run([login_url]);