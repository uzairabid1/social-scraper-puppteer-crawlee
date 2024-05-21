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

var profile_url = 'https://www.youtube.com/@KatyPerry/'


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
            var distance = 1000;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight - window.innerHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
}


function normalizeDate(datePublished) {
  return datePublished.substring(0, 10); 
}

async function scrapeYoutubePost(videoIDArray,playlists,channels,about){
  let post_idx = 1;
  for(let videoID of videoIDArray){
    let info = await ytdl.getInfo(videoID);
    let data = {
      post_title: info.videoDetails.title,
      post_description: info.videoDetails.description,
      post_user: info.videoDetails.author.user,
      post_link: info.videoDetails.video_url,
      post_date: normalizeDate(info.videoDetails.uploadDate),
      playlist_names: playlists,
      channels: channels,
      about: about
    }
    
    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.date);
    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      continue;
    }else{
      for (const format of info.formats){
        if(format.quality=='medium' && format.hasAudio==true){
          let video_path = `./output/${data.post_user}/post_${post_idx}/video.mp4`;
          await downloadFile(format.url,video_path);
          data.post_local = video_path;
          console.log('done');
          post_idx++;
          // axios.post(webhookUrl, data)
          // .then(function (response) {
          //   console.log('Data sent to webhook successfully:', response.data);
          // })
          // .catch(function (error) {
          //   console.error('Error sending data to webhook:', error);
          // });
          console.log(data);
          break;
        }
    
        if(format.quality=='small' && format.hasAudio==true){
            let video_path = `./output/${data.post_user}/post_${post_idx}/video.mp4`;
            await downloadFile(format.url,video_path);
            data.post_local = video_path;
            console.log('done');
            post_idx++;
            // axios.post(webhookUrl, data)
            // .then(function (response) {
            //   console.log('Data sent to webhook successfully:', response.data);
            // })
            // .catch(function (error) {
            //   console.error('Error sending data to webhook:', error);
            // });
            console.log(data);
            break;
          }  
      }
    }
  }  

}

async function getPlaylists(page){
  await page.goto(profile_url+"playlists");
  let playlists = [];
  
  try{
    await page.waitForXPath("//a[@id='video-title']");
    let playlists_elements = await page.$x("//a[@id='video-title']");

    for(const playlist_el of playlists_elements){
      let playlist_name = await page.evaluate((el=>el.getAttribute("title")),playlist_el);
      playlists.push(playlist_name);
    }
  
  }catch(e){
    console.log('no playlist')
  }

return playlists;
}


async function getChannels(page){

  await page.goto(profile_url+"channels");
  let channels = [];
  
  try{
    await page.waitForXPath("//div[@id='channel']/a/span[@id='title']");
    let channels_elements = await page.$x("//div[@id='channel']/a/span[@id='title']");
    for(const channel_el of channels_elements){
      let channel = await page.evaluate((el=>el.textContent.trim()),channel_el);
      channels.push(channel);
    }
  }catch(e){
    console.log('no channels');
  }

  return channels;
}

async function getAbout(page){
  await page.goto(profile_url+"about");
  let about = "";
  try{
    await page.waitForXPath("//ytd-channel-about-metadata-renderer/div/div[@id='description-container']/yt-formatted-string[2]");
    let about_element = await page.$x("//ytd-channel-about-metadata-renderer/div/div[@id='description-container']/yt-formatted-string[2]");
    about_element = about_element[0];
    about = await page.evaluate((el=>el.textContent.trim()),about_element);
  }catch(e){
    console.log("no about section");
  }

  return about;
}

const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );
    
    await delay(2000);
    await page.waitForXPath("//div[@id='contents']/ytd-rich-grid-row");

    let page2 = await page.browser().newPage();
    let playlists = await getPlaylists(page2); 
    await page2.close();

    let page3 = await page.browser().newPage();
    let channels = await getChannels(page3);
    await page3.close();

    let page4 = await page.browser().newPage();
    let about = await getAbout(page4);
    await page4.close();
    
    for(let idx = 0; idx < 200;idx++){
      await autoScroll(page);
      await delay(500);
    }

    await page.waitForXPath("//div[@id='contents']/ytd-rich-grid-row");

    let videoIDArray = [];
    let urls_elements = await page.$x("//div[@id='contents']/ytd-rich-grid-row/div/ytd-rich-item-renderer/div/ytd-rich-grid-media/div[1]/div[@id='details']/div[@id='meta']/h3/a");
    
    for(const url_el of urls_elements){
        let url = await page.evaluate((el=>el.getAttribute('href')),url_el);
        let videoID = url.split("?v=")[1];
        videoIDArray.push(videoID);
    }

    videoIDArray = new Set(videoIDArray);
    videoIDArray = Array.from(videoIDArray);
    console.log(videoIDArray);
    console.log(videoIDArray.length);
    await scrapeYoutubePost(videoIDArray,playlists,channels,about);

  },
  useSessionPool: true,
  retryOnBlocked: true,
  requestHandlerTimeoutSecs: 999999,
  maxRequestRetries: 1,
  launchContext: {
    launcher: puppeteerExtra,
    launchOptions: {
      protocolTimeout: 999999,
      headless: true,
      args: ['--disable-notifications','--no-sandbox'],
      defaultViewport: null,
    },
  },
});



await crawler.run([profile_url+"videos"]);