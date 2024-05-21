import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import ytdl from 'ytdl-core';
import { auto } from 'async';





const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var profile_url = 'https://www.reddit.com/user/uchman365/'


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


  async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 100;
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


function normalizeDate(datePublished) {
  return datePublished.substring(0, 10); 
}

async function scrapeRedditPosts(page){

  let data = {
    post_user: '',
    post_title: '',
    post_url: '',
    post_date: '',
    post_image_url: [],
    post_video_url: '',

}

  await page.waitForXPath("//shreddit-post");
  let reddit_posts_elements = await page.$x("//shreddit-post");
  let reddit_post_idx = 0;

  for(const reddit_el of reddit_posts_elements){
    let post_user = await page.evaluate((el=>el.getAttribute('author')),reddit_el);
    let post_title = await page.evaluate((el=>el.getAttribute('post-title')),reddit_el);
    let post_url = await page.evaluate((el=>el.getAttribute('content-href')),reddit_el);
    let post_date = await page.evaluate((el=>el.getAttribute('created-timestamp')),reddit_el);
    let post_video_url;
    let post_image_url = [];
    try{
      let post_video_url_el = await page.$x(`//shreddit-post[${reddit_post_idx+1}]/div[@slot='post-media-container']/shreddit-aspect-ratio/shreddit-async-loader/media-telemetry-observer/shreddit-player`);
      post_video_url_el = post_video_url_el[0];
      post_video_url = await page.evaluate((el=>el.getAttribute('src')),post_video_url_el);
    }catch(e){
      post_video_url = '';
    }
    try{
      let post_image_url_el = await page.$x(`//shreddit-post[${reddit_post_idx+1}]/div[@slot='post-media-container']/shreddit-aspect-ratio/a/div/img[1]`)
      post_image_url_el = post_image_url_el[0];
      let post_image = await page.evaluate((el=>el.getAttribute("src")),post_image_url_el); 
      post_image_url.push(post_image);
    }catch(e){
      post_image_url = [];
    }
    try{
      let post_image_url_els = await page.$x(`//shreddit-post[${reddit_post_idx+1}]/div[@slot='post-media-container']/shreddit-async-loader/gallery-carousel/ul/li/img`)
      for(const image_el of post_image_url_els){
        const image_url = await page.evaluate((el=>el.getAttribute('src')),image_el);
        post_image_url.push(image_url);
      }
    }catch(e){
      post_image_url = [];
    }
    
    data.post_user = post_user;
    data.post_title = post_title;
    data.post_date = normalizeDate(post_date);
    data.post_url = post_url;
    data.post_image_url = post_image_url;
    data.post_video_url = post_video_url;

    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.post_date);
    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      continue;
    } else {
      if (data.post_video_url != '') {
        let video_path = `./output/${data.post_user}/post_${reddit_post_idx+1}/video.mp4`;
        data.video_local = video_path;
        await downloadFile(data.post_video_url, video_path);
      }

      if (data.image_urls != []) {
        let image_idx = 1;
        let image_local = [];
        for (const image of data.post_image_url) {
          let image_path = `./output/${data.post_user}/post_${reddit_post_idx+1}/image${image_idx}.jpg`;
          image_local.push(image_path);
          await downloadFile(image, image_path);
          image_idx++;
        }
        data.image_local = image_local;
      }
      // axios.post(webhookUrl, data)
      //   .then(function (response) {
      //     console.log('Data sent to webhook successfully:', response.data);
      //   })
      //   .catch(function (error) {
      //     console.error('Error sending data to webhook:', error);
      //   });
      reddit_post_idx++;
      console.log(data);
    }
  } 

}

async function scrapeComments(page){
  let comments_data = {
    post_url : '',
    comment_author: '',
    comment: ''
  }

  await page.waitForXPath("//shreddit-profile-comment");

  let comments_elements = await page.$x("//shreddit-profile-comment");

  let comments_idx = 0;

  for(const post_el of comments_elements){
    let post_url = await page.evaluate((el=>"https://www.reddit.com" + el.getAttribute("href")),post_el);
    let comment_el = await page.$x(`(//shreddit-profile-comment)[${comments_idx+1}]/div/div[2]/div/p`);
    comment_el = comment_el[0];
    let comment = await page.evaluate((el=>el.textContent.trim()),comment_el);

    let comment_author_el = await page.$x(`(//shreddit-profile-comment)[${comments_idx+1}]/div/shreddit-comment-action-row/shreddit-overflow-menu/faceplate-tracker/shreddit-report-comment-menu-button`);
    comment_author_el = comment_author_el[0];
    let comment_author = await page.evaluate((el=>el.getAttribute("author-name")),comment_author_el);

    comments_data.post_url = post_url;
    comments_data.comment_author = comment_author;
    comments_data.comment = comment;

    // axios.post(webhookUrl, comments_data)
    //     .then(function (response) {
    //       console.log('Data sent to webhook successfully:', response.data);
    //     })
    //     .catch(function (error) {
    //       console.error('Error sending data to webhook:', error);
    //     });

    console.log(comments_data);
    comments_idx++;
  }




}




const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );
    
    await delay(2000);

    // await autoScroll(page);
    // await autoScroll(page);
    // await autoScroll(page);

    await scrapeRedditPosts(page);
    await page.goto(profile_url+"comments");

    // await autoScroll(page);
    // await autoScroll(page);
    // await autoScroll(page);

    await scrapeComments(page);




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



await crawler.run([profile_url+"submitted"]);