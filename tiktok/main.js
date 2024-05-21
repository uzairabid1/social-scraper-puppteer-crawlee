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

var profile_url = 'https://www.tiktok.com/@senoritaa59';




function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
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




async function scrapeTiktokPosts(page,likeFlag) {
  await page.waitForXPath("//div[@class='tiktok-x6y88p-DivItemContainerV2 e19c29qe8']/div[2]/div/a");

  let links_elements = await page.$x("//div[@class='tiktok-x6y88p-DivItemContainerV2 e19c29qe8']/div[2]/div/a");

  console.log(links_elements.length);
  let links = [];
  for (const link_el of links_elements){
    let link = await page.evaluate((el=>el.getAttribute('href')),link_el);
    links.push(link);
  }

  let post_idx=0;
  let liked_idx=0;
  for (const link of links) {
    let data = {
      post_user: '',
      post_url: link,
      post_date: '',
      post_desc: '',
      video_audio_url: '',
      cover_url: '',
    };
    let video_id = link.split('/')[5];
    let response = await axios.get(`https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${video_id}`);
  
    if (response.status === 200) {
      const responseData = response.data;
  
      if (responseData.status_code === 0 && responseData.aweme_list.length > 0) {
        const aweme = responseData.aweme_list[0];
        const author = aweme.author;
        const video = aweme.video;
        const cover = video.cover;
  
        data.post_user = author.unique_id;
        data.post_date = new Date(aweme.create_time * 1000); 
        data.post_date = normalizeDate(data.post_date.toISOString());
        console.log(data.post_date)
        data.post_desc = aweme.desc;
        data.video_audio_url = video.play_addr.url_list[0];
        data.cover_url = cover.url_list[0];

        const specifiedYearDate = new Date();
        specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
        const postDate = new Date(data.post_date);
        if (postDate <= specifiedYearDate) {
          console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
          continue;
        } else {

          if(!likeFlag){
            if (data.video_audio_url != '') {
              let video_path = `./output/${data.post_user}/post_${post_idx+1}/video.mp4`;
              data.video_local = video_path;
              await downloadFile(data.video_audio_url, video_path);
            }
      
            if (data.cover_url != '') {
              let image_path = `./output/${data.post_user}/post_${post_idx+1}/image.jpg`;
              data.image_local = image_path;
              await downloadFile(data.cover_url,image_path);
            }
            axios.post(webhookUrl, data)
            .then(function (response) {
              console.log('Data sent to webhook successfully:', response.data);
            })
            .catch(function (error) {
              console.error('Error sending data to webhook:', error);
            });
            post_idx++;
          }
          else{
            if (data.video_audio_url != '') {
              let video_path = `./output/${data.post_user}/liked_${liked_idx+1}/video.mp4`;
              data.video_local = video_path;
              await downloadFile(data.video_audio_url, video_path);
            }
      
            if (data.cover_url != '') {
              let image_path = `./output/${data.post_user}/liked_${liked_idx+1}/image.jpg`;
              data.image_local = image_path;
              await downloadFile(data.cover_url,image_path);
            }
            axios.post(webhookUrl, data)
            .then(function (response) {
              console.log('Data sent to webhook successfully:', response.data);
            })
            .catch(function (error) {
              console.error('Error sending data to webhook:', error);
            });
            liked_idx++;
          }

        console.log(data); 
      }
    }
  }
}
}


const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );
    
    for(let idx=0;idx<3;idx++){
      await autoScroll(page);
    }    
    let likeFlag = false;
    await scrapeTiktokPosts(page,likeFlag);
    
    await page.goto(profile_url);

    let liked_button = await page.$x("//p[@data-e2e='liked-tab']");
    liked_button = liked_button[0];

    likeFlag = true;
    await liked_button.evaluate((liked_button=>liked_button.click()));

    for(let idx=0;idx<3;idx++){
      await autoScroll(page);
    }   

    await scrapeTiktokPosts(page,likeFlag);
    
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



await crawler.run([profile_url]);