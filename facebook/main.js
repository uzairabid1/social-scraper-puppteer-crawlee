import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { url } from 'inspector';




const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var profile_url = 'https://www.facebook.com/raza.agha.92/'

const credentials = JSON.parse(fs.readFileSync('credentials.json'));
let lastUsedCredentialIndex = 0;

if (fs.existsSync('lastUsedCredentialIndex.json')) {
  lastUsedCredentialIndex = parseInt(fs.readFileSync('lastUsedCredentialIndex.json'));
}

function resetCredentialIndex() {
  lastUsedCredentialIndex = 0;
  fs.unlinkSync('lastUsedCredentialIndex.json'); // Delete the file
}

function getNextCredentials() {
  if (lastUsedCredentialIndex < credentials.length) {
    const { username, password } = credentials[lastUsedCredentialIndex];
    lastUsedCredentialIndex++;
    fs.writeFileSync('lastUsedCredentialIndex.json', lastUsedCredentialIndex.toString());
    return { username, password };
  } else {
    console.log("All credential pairs have been tried.");
    resetCredentialIndex(); // Reset the index and file
    return getNextCredentials(); // Recursively call to get the first credential
  }
}

function calculatePostDate(input) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();

  // Define time constants
  const timeConstants = {
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
    'w': 7 * 24 * 60 * 60 * 1000,
    'mo': 30.44 * 24 * 60 * 60 * 1000,
    'yr': 365.25 * 24 * 60 * 60 * 1000,
  };

  // Define a function to calculate the post date based on a numeric value and a time unit
  function calculateDateFromValue(value, unit) {
    if (!timeConstants[unit]) {
      throw new Error('Invalid unit of time');
    }
    return new Date(currentDate.getTime() - value * timeConstants[unit]);
  }

  // Regular expression patterns for different input formats
  const patterns = [
    { pattern: /^(\d+)\s*(h(?:rs?)?)$/, modifier: 'h' },
    { pattern: /^(\d+)\s*(d(?:ay)?)$/, modifier: 'd' },
    { pattern: /^(\d+)\s*(w(?:eek)?)$/, modifier: 'w' },
    { pattern: /^(\d+)\s*(mo(?:nth)?)$/, modifier: 'mo' },
    { pattern: /^(\d+)\s*(yr(?:ear)?)$/, modifier: 'yr' },
    { pattern: /^Yesterday$/, modifier: 'd', value: 1 },
    { pattern: /^(\d{1,2}) (\w+)(?: at (\d{1,2}):(\d{1,2}))?$/, modifier: 'custom' },
  ];

  for (const { pattern, modifier, value } of patterns) {
    const match = input.match(pattern);
    if (match) {
      if (modifier === 'custom') {
        const day = parseInt(match[1], 10);
        const monthName = match[2];
        let hours = 0;
        let minutes = 0;

        if (match[3] && match[4]) {
          hours = parseInt(match[3], 10);
          minutes = parseInt(match[4], 10);
        }

        const monthNumber = new Date(`${monthName} 1, ${currentYear}`).getMonth() + 1;
        const postDate = new Date(currentYear, monthNumber - 1, day, hours, minutes);
        const year = postDate.getFullYear();
        const month = String(postDate.getMonth() + 1).padStart(2, '0');
        const dayFormatted = String(postDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${dayFormatted}`;
        return formattedDate;
      } else {
        const numericValue = value || parseInt(match[1], 10);
        const postDate = calculateDateFromValue(numericValue, modifier);
        const year = postDate.getFullYear();
        const month = String(postDate.getMonth() + 1).padStart(2, '0');
        const day = String(postDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        return formattedDate;
      }
    }
  }

  // Attempt to parse date using JavaScript's Date.parse
  const parsedDate = Date.parse(input);
  if (!isNaN(parsedDate)) {
    const date = new Date(parsedDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    return formattedDate;
  }

  throw input;
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
  
      // Extract the directory path from savePath
      const directoryPath = path.dirname(savePath);
  
      // Create the directory path if it doesn't exist
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


function extractVideoURL(jsonData) {
    try {
        const decodedData = jsonData.replace(/&quot;/g, '"');
        const data = JSON.parse(decodedData);
        if (data && data.src) {
            return data.src;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
  }

function fixImageURL(originalString) {
    const step1 = originalString.replace(/\\3a/g, ":");  

    const step2 = step1.replace(/\\3d/g, "=");  

    const step3 = step2.replace(/\\26/g, "&");  

    const finalString = step3.replace(/\s/g, '');  
   
    const urlRegex = /url\('([^']+)'\)/;
    const match = finalString.match(urlRegex);
  
    if (match) {
      const url = match[1];
      return url;
    } else {
      return null;
    }
  }

async function getLikedPages(page){

  let liked_pages = [];

  await page.waitForXPath("//span[.='All Likes']/parent::div/parent::a/parent::div/parent::div/parent::div/parent::div/parent::div/following-sibling::div/div/div/div/a");
  await autoScroll(page);
  await autoScroll(page);
  await autoScroll(page);
  await page.waitForXPath("//span[.='All Likes']/parent::div/parent::a/parent::div/parent::div/parent::div/parent::div/parent::div/following-sibling::div/div/div/div/a");

  let all_likes_elements_pic = await page.$x("//span[.='All Likes']/parent::div/parent::a/parent::div/parent::div/parent::div/parent::div/parent::div/following-sibling::div/div/div/div/a/div/div/div[1]/div/div/img");
  let all_likes_elements_name = await page.$x("//span[.='All Likes']/parent::div/parent::a/parent::div/parent::div/parent::div/parent::div/parent::div/following-sibling::div/div/div/div/a/div/div/div[2]/div/div[1]/span");
  if (all_likes_elements_pic.length > 0){
    let like_idx = 0;
    for(const picture_el of all_likes_elements_pic){
        let liked_page = {
          page_name: '',
          page_picture: ''
        };
        const page_picture = await page.evaluate(el=>el.getAttribute('src'),picture_el);
        const name_el = all_likes_elements_name[like_idx];
        const page_name = await page.evaluate(el=>el.textContent.trim(),name_el);        
        liked_page.page_name = page_name;
        liked_page.page_picture = page_picture;
        liked_pages.push(liked_page);
        like_idx++;
    }
  }
  else{
    console.log('no likes');
    liked_pages = [];
  }
  return liked_pages;
}


async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 50;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight - window.innerHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

async function extract(page,profile_name,profile_picture,url,liked_pages){

    let data = {
      profile_name: profile_name,
      profile_picture: profile_picture,
      post_url: url,
      post_text: "",
      date : "",
      video_url: "",
      image_urls: [],
      video_local: "",
      image_local: [],
      comments: [],
      liked_pages: liked_pages
    }

    //post text
    await page.waitForSelector('div.story_body_container>div._5rgt');
    let text_element = await page.$("div.story_body_container>div._5rgt");
    let post_text = '';
    try{
      post_text = await page.evaluate(el => el.textContent.trim(),text_element);
    }catch(e){
      post_text = ''
    }

    //date
    let date_element = await page.$("div[data-sigil$='m-feed-voice-subtitle']>a>abbr");

    let date = await page.evaluate(el => el.textContent.trim(),date_element);
    try{
      date = date.split(' at ')[0];
    }catch(e){
      date =  date;
    }
    date = calculatePostDate(date);

    //video
    let video_url = '';
    try{
      let video_element = await page.$("div._53mw");
      video_url = await page.evaluate(el=>el.getAttribute("data-store"),video_element);
      video_url = extractVideoURL(video_url);
    }catch(e){
      console.log("no video url");
      video_url = ''
    }
    
    //images
    let image_elements = [];
    let image_urls = [];
    
    
    image_elements = await page.$$("a._26ih>div>i");
    
    if(image_elements.length == 0){
      image_elements = await page.$$("a._39pi > div > div > i");
    }    
  
    if (image_elements.length > 0) {
      for (const element of image_elements) {
        let src = await page.evaluate(el=>el.getAttribute("style"),element);
        src = fixImageURL(src); 
        console.log(src)
        image_urls.push(src);
      }
  
      
    } else {
      console.log('No matching elements found.');
      image_urls = [];
    }

    //comments
    let commment_elements = [];
    let comments = [];
    
    commment_elements = await page.$x(`//a[contains(.,'${profile_name}')]/parent::div/following-sibling::div[@data-sigil='comment-body']`);

    if(commment_elements.length > 0){
      for(const element of commment_elements){
        let comment = await page.evaluate(el=>el.textContent.trim(),element);
        comments.push(comment);
      }
    }
    else{
      console.log('no comments');
      comments = [];
    }

    data.post_text = post_text;
    data.date = date;
    data.video_url = video_url;
    data.image_urls = image_urls;
    data.comments = comments;

    return data;
}

const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );
    const title = await page.title();
    log.info(`Title of ${request.loadedUrl} is '${title}'`);
    
    await delay(2000);
    // await page.waitForSelector("div#mobile_login_bar>div:nth-child(2)>a:nth-child(3)");
    const logIn = await page.$('div#mobile_login_bar>div:nth-child(2)>a:nth-child(3)');
    await logIn.evaluate(logIn => logIn.click());

    await page.waitForSelector("input#m_login_email");
    const newCredentials = getNextCredentials();
    if (newCredentials) {
      const { username, password } = newCredentials;
      await page.type("input#m_login_email", username);
      await page.type("input#m_login_password", password);
      const form = await page.$('button[name="login"]');
      await form.evaluate(form => form.click());
    } else {
      console.log("No more credentials to try. Exiting.");
    }  


    await delay(500);
    
    let home_url = page.url();   
    await page.waitForSelector("div#cover-name-root>h3");


    let page2 = await page.browser().newPage();
    await page2.goto(profile_url +"likes");
    await delay(500);
    let liked_pages = await getLikedPages(page2); 
    await page2.close();

    await page.waitForSelector("div#cover-name-root>h3");
    let profile_name_element = await page.$("div#cover-name-root>h3");
    let profile_name = await page.evaluate(el => el.textContent.trim(), profile_name_element);

    let profile_picture_element = await page.$("div._42b6._1zet>i");
    let profile_picture = await page.evaluate(el => el.getAttribute("style"), profile_picture_element);
    profile_picture = fixImageURL(profile_picture);

    await page.waitForSelector("article>div>header>div:nth-child(2)>div>div>div:nth-child(1)>div:nth-child(2)>a");

    await delay(1000);
    await autoScroll(page);
    await autoScroll(page);
    await autoScroll(page);

    await page.waitForSelector("article>div>header>div:nth-child(2)>div>div>div:nth-child(1)>div:nth-child(2)>a");
    const postsUrl = await page.$$("article>div>header>div:nth-child(2)>div>div>div:nth-child(1)>div:nth-child(2)>a");

    let urls = [];
    for (const post of postsUrl) {
      const postUrl = "https://m.facebook.com" + await page.evaluate(post => post.getAttribute('href'), post);
      urls.push(postUrl);
    }
    console.log(urls);
    console.log(urls.length);
    let post_idx = 1;
    for (const url of urls) {
      await page.goto(url);
      await delay(5000);
      const data = await extract(page, profile_name, profile_picture, url,liked_pages);
      const specifiedYearDate = new Date();
      specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
      const postDate = new Date(data.date);
      
      if (postDate <= specifiedYearDate) {
          console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
          continue;
        }
      else{       
        if (data.video_url != ''){
          let video_path =  `./output/${data.profile_name}/post_${post_idx}/video.mp4`;
          data.video_local = video_path;
          await downloadFile(data.video_url,video_path);
        }

        if (data.image_urls != []){
          let image_idx = 1;
          let image_local = [];
          for(const image of data.image_urls){
            let image_path = `./output/${data.profile_name}/post_${post_idx}/image${image_idx}.jpg`;
            image_local.push(image_path);            
            await downloadFile(image,image_path);
            image_idx++;
          }
          data.image_local = image_local;

        }
        axios.post(webhookUrl, data)
          .then(function (response) {
            console.log('Data sent to webhook successfully:', response.data);
          })
          .catch(function (error) {
            console.error('Error sending data to webhook:', error);
          });

        console.log(data);
      }  
      

     
      post_idx++;
    }
    await delay(2000);
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



await crawler.run([profile_url.replace('www','m')]);