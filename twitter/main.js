import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getVideoUrl } from './twitter-dl.js';


const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var login_url = 'https://twitter.com/i/flow/login'
var profile_url = 'https://twitter.com/raza_agha7';


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
    const { email, password, username } = credentials[lastUsedCredentialIndex];
    lastUsedCredentialIndex++;
    fs.writeFileSync('lastUsedCredentialIndex.json', lastUsedCredentialIndex.toString());
    return { email, password, username };
  } else {
    console.log("All credential pairs have been tried.");
    resetCredentialIndex(); // Reset the index and file
    return getNextCredentials(); // Recursively call to get the first credential
  }
}



function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  } 

async function twitterScrape(userInput) {

    try {
  
      if (!userInput.match(new RegExp(/(twitter).(com)/,'ig'))) {
        throw new Error('url_err');
      }
      const url = `https://twdown.app/api/twitter?url=${userInput}`
      const result = await axios.get(url);
  
      const media = result.data.data
  
      media.totalMedia = media.videos.length
      console.log(media);
      
    } catch (error) {
      console.error(error);
    }
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


async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight - (window.innerHeight+2500)){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}


function normalizeDate(datePublished) {
  return datePublished.substring(0, 10); 
}

async function extract(page,link,profile_picture,followed_accounts){
    let data = {  
      tweet_text: '',
      tweet_user: '',
      tweet_link: link,
      tweet_date: '',
      tweet_video: '',
      profile_picture: profile_picture,
      followed_accounts: followed_accounts
    }

    
    let tweet_user_el;
    let tweet_user; 
    try{
      await page.waitForSelector("article>div:nth-child(2)>div:nth-child(2)>div>div>div>div>a>div>div");
      tweet_user_el = await page.$("article>div:nth-child(2)>div:nth-child(2)>div>div>div>div>a>div>div");  
      tweet_user = await page.evaluate((el=>el.textContent.trim()),tweet_user_el);   
    }catch(e){
      try{
        await page.waitForSelector("article[role='article']>div:nth-child(3)>div:nth-child(2)>div>div>div>div:nth-child(2)>a>div>div");
        tweet_user_el = await page.$("article[role='article']>div:nth-child(3)>div:nth-child(2)>div>div>div>div:nth-child(2)>a>div>div");
        tweet_user = await page.evaluate((el=>el.textContent.trim()),tweet_user_el);  
      }catch(e){
        tweet_user = ''
      }
    }

    let tweet_text;
    try{
      let tweet_text_el = await page.$x(`//span[contains(text(),'${tweet_user}')]/parent::div/parent::div/parent::a/parent::div/parent::div/parent::div/parent::div/parent::div/parent::div/following-sibling::div[1]/div`);
      tweet_text_el = tweet_text_el[0];
      tweet_text = await page.evaluate((el=>el.textContent.trim()),tweet_text_el);
    }catch(e){
      tweet_text = '';
    }


    await page.waitForSelector("time");
    let tweet_date_el = await page.$("time");
    let tweet_date = await page.evaluate((el=>el.getAttribute("datetime")),tweet_date_el);
    tweet_date = normalizeDate(tweet_date);

    let video_exists_el;
    let video_exists;
    let video_url;
    try{
        video_exists_el = await page.$("div[data-testid='videoComponent']");
        video_exists = await page.evaluate((el=>el.getAttribute('data-testid')),video_exists_el);
    }catch(e){
        video_exists = '';
    }
    if(video_exists=='videoComponent'){
      try{
        video_url = await getVideoUrl(link);
      }catch(e){
        video_url = '';
      }
    }
    else{
      video_url = '';
    }

    let image_exists_el;    
    let image_urls=[];
 
    image_exists_el = await page.$$("div[aria-label='Image']>img");
      for(const image_el of image_exists_el){
        image_urls.push(await page.evaluate((el=>el.getAttribute('src')),image_el));
      }



    data.tweet_text = tweet_text;
    data.tweet_date = tweet_date;
    data.tweet_user = tweet_user;
    data.tweet_video = video_url;   
    data.image_urls = image_urls;
    return data;
}

async function getLikedTweets(page){

}


async function getProfilePicture(page){
  await page.goto(profile_url+"/photo");
  await page.waitForSelector("div[aria-label='Image']>img");
  let profile_picture_element = await page.$("div[aria-label='Image']>img");
  let profile_picture = await page.evaluate((el=>el.getAttribute("src")),profile_picture_element);

  return profile_picture;
}

async function getFollowedAccounts(page){
  await page.goto(profile_url+"/following");
  
  let total_followed_accounts = [];
  for(let idx=0;idx<10;idx++){      
    let followed_account= [];

    await delay(500);
    
    await page.waitForSelector("div[data-testid='UserCell']>div>div:nth-child(2)>div:nth-child(1)>div:nth-child(1)>div>div:nth-child(2)>div>a>div>div>span");
     
    followed_account = await page.$$("div[data-testid='UserCell']>div>div:nth-child(2)>div:nth-child(1)>div:nth-child(1)>div>div:nth-child(2)>div>a>div>div>span");
       
    for (let link of followed_account){
      try{total_followed_accounts.push(await page.evaluate((el=>el.textContent.trim()),link));}catch(e){console.log("no follower");}   
    }
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");     
  }
  return total_followed_accounts;
}

async function loginToTwitter(page){
  await page.waitForSelector('input[autocomplete="username"]');

  try{
   let not_now_element = await page.$x("//span[contains(text(),'Not now')]/parent::span/parent::div/parent::div")[0];
   await not_now_element.evaluate(not_now_element=>not_now_element.click());
  }
  catch(e){
    console.log('no notif');
  }
  await delay(2000);
  await page.waitForSelector('input[autocomplete="username"]');
  const newCredentials = getNextCredentials();
  if (newCredentials) {
    const { email, password, username } = newCredentials;
    await page.type('input[autocomplete="username"]', username);
    await page.waitForXPath("//span[contains(text(),'Next')]/parent::span/parent::div/parent::div");
    let login_element = await page.$x("//span[contains(text(),'Next')]/parent::span/parent::div/parent::div");
    login_element = login_element[0];
    await login_element.evaluate(login_element=>login_element.click());
    
    await page.waitForSelector('input[autocomplete="current-password"]');
    await page.type('input[autocomplete="current-password"]', password);
    let form = await page.$x("//span[contains(text(),'Log in')]/parent::span/parent::div/parent::div");
    form = form[0]; 
    await form.evaluate(form => form.click());
    await delay(2000);
  } else {
    console.log("No more credentials to try. Exiting.");
  } 

}

async function scrapeTweetsAndHandleLikes(page, specified_year, total_tweets_links, webhookUrl, profile_url, profile_picture, followed_accounts,flag) {
  for (let idx = 0; idx < 500; idx++) {
    let tweet_link = [];

    await delay(500);

    await page.waitForSelector("article[role='article']>div>div>div:nth-child(2)>div:nth-child(2)>div:nth-child(1)>div>div:nth-child(1)>div>div>div:nth-child(2)>div>div:nth-child(3)>a");

    tweet_link = await page.$$("article[role='article']>div>div>div:nth-child(2)>div:nth-child(2)>div:nth-child(1)>div>div:nth-child(1)>div>div>div:nth-child(2)>div>div:nth-child(3)>a");

    for (let link of tweet_link) {
      try {
        total_tweets_links.push("https://www.twitter.com" + await page.evaluate((el => el.getAttribute('href')), link));
      } catch (e) {
        console.log("No link");
      }
    }
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  }

  total_tweets_links = new Set(total_tweets_links);
  console.log(total_tweets_links.size);

  let post_idx = 1;
  for (let tweetUrl of total_tweets_links) {
    const userId = tweetUrl.match(/\d+$/);
    const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${userId}`;
    await page.goto(embedUrl);
    let data = await extract(page, tweetUrl, profile_picture, followed_accounts);
    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.date);
    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      break;
    } else {
      if (data.tweet_video != '') {
        let video_path;
        if(flag){
          video_path = `./output/${profile_url.split("/")[3]}/tweet_${post_idx}/video.mp4`;
        }
        else{
          video_path = `./output/${profile_url.split("/")[3]}/liked_tweet_${post_idx}/video.mp4`;
        }
        data.video_local = video_path;
        await downloadFile(data.tweet_video, video_path);
      }

      if (data.image_urls != []) {
        let image_idx = 1;
        let image_local = [];
        for (const image of data.image_urls) {
          let image_path;
          if(flag){
            image_path = `./output/${profile_url.split("/")[3]}/tweet_${post_idx}/image${image_idx}.jpg`;
          }
          else{
            image_path = `./output/${profile_url.split("/")[3]}/liked_tweet_${post_idx}/image${image_idx}.jpg`;
          }
          image_local.push(image_path);
          await downloadFile(image, image_path);
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
      post_idx++;
      console.log(data);
    }
  }
}


const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );

    await loginToTwitter(page);
    await page.goto(profile_url);
    await delay(5000);
    
    await page.waitForSelector("article[role='article']");

    let total_tweets_links = [];

    let page2 = await page.browser().newPage();
    let profile_picture = await getProfilePicture(page2); 
    await page2.close();

    let page3 = await page.browser().newPage();
    let followed_accounts = await getFollowedAccounts(page3);
    await page3.close();
    let flag = true;
    await scrapeTweetsAndHandleLikes(page, specified_year, total_tweets_links, webhookUrl, profile_url, profile_picture, followed_accounts,flag);
    log.info("TWEETS FINISHED...");
    log.info("GETTING LIKED TWEETS...");
    await page.close();
    console.log(total_tweets_links.length);
    total_tweets_links = [];
    let page4 = await page.browser().newPage();
    flag = false;
    await page4.goto(profile_url + "/likes");
    await scrapeTweetsAndHandleLikes(page4, specified_year, total_tweets_links, webhookUrl, profile_url, profile_picture, followed_accounts,flag);  
    await page4.close();


    
    await delay(10000);
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