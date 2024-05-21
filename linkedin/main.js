import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BrowserCrawler, BrowserPool, PuppeteerCrawler} from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';


const webhookUrl = 'https://webhook.site/e4b15e52-e760-4a20-83ba-22915bbe35a7';

puppeteerExtra.use(stealthPlugin());

dotenv.config();

var login_url = 'https://www.linkedin.com/login';
var profile_url = 'https://www.linkedin.com/in/mujtabaraza/';


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

async function calculatePostDate(input) {
    const regex = /^(\d+)([hdmoyrw]{1,2})$/;

    const timeConstants = {
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000,
        'mo': 30.44 * 24 * 60 * 60 * 1000,
        'yr': 365.25 * 24 * 60 * 60 * 1000,
    };

    if (input.toLowerCase() === 'now') {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        return formattedDate;
    }

    const match = input.match(regex);

    if (!match) {
        throw new Error('Invalid input format');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (!timeConstants[unit]) {
        throw new Error('Invalid unit of time');
    }

    const currentDate = new Date();
    const postDate = new Date(currentDate.getTime() - value * timeConstants[unit]);

    const year = postDate.getFullYear();
    const month = String(postDate.getMonth() + 1).padStart(2, '0');
    const day = String(postDate.getDate()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}`;

    return formattedDate;
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


async function login(page){

  await delay(4000);

  await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
  const newCredentials = getNextCredentials();
  if (newCredentials) {
    const { email, password, username } = newCredentials;
    await page.type("#username", email);
    await delay(1000);
    await page.type("#password", password);
    await delay(1000);
    const form = await page.$('button.btn__primary--large');
    await form.evaluate(form => form.click());
    await delay(17000);
  } else {
    console.log("No more credentials to try. Exiting.");
  } 
}

function normalizeDate(datePublished) {
  return datePublished.substring(0, 10); 
}


async function scrapeInterests(page){
  await page.goto(profile_url+"details/interests");
  let interests = [];
  // await page.waitForXPath("//ul[@class='pvs-list ']/li/div/div/div[2]/div[1]/a");
  await delay(3000);
  let interestsElements = await page.$x("//ul[@class='pvs-list ']/li/div/div/div[2]/div[1]/a");
  let idx = 0;
  for(const interestsElement of interestsElements){
    let interest = {
      profile_name: '',
      profile_link: ''
    }
    let profile_link = await page.evaluate(interestsElement=>interestsElement.getAttribute('href'),interestsElement);
    let profile_name_element = await page.$x(`(//ul[@class='pvs-list ']/li/div/div/div[2]/div[1]/a/div/div[1]/div/div/span[1])[${idx+1}]`);
    profile_name_element = profile_name_element[0];
    let profile_name = await page.evaluate(profile_name_element=>profile_name_element.textContent.trim(),profile_name_element);
    interest.profile_name = profile_name;
    interest.profile_link = profile_link;
    interests.push(interest);
    idx = idx+1;
  }
  return interests;
}

async function scrapeComments(page,interests){
  await page.goto(profile_url + "recent-activity/comments");
  console.log('meow')
  await delay(4000);

  // await autoScroll(page);
  // await autoScroll(page);
  // await autoScroll(page);
 

  let selectedDate = [];
  let selectedDateFlag = true;
  selectedDate = await page.$$("div.feed-shared-update-v2>div>div.update-components-actor>div>div>a:nth-child(2)"); //aria-label

  if(selectedDate.length == 0){
    selectedDate = await page.$$("div.feed-shared-update-v2>div>div>div.ml4.mt2.text-body-xsmall");
    selectedDateFlag =  false;
  }
  console.log(selectedDate.length);
  let commentFlag = true;
  await extract(page,selectedDate,interests,selectedDateFlag,commentFlag);
  
}


async function extract(page,selectedDate,interests,selectedDateFlag,commentFlag){
  let idx = 0;
  for(const dateElement of selectedDate){
   let data;
   if (!commentFlag){
    data = {
      post_author_name: "",
      post_url: "",
      post_date: "",
      post_description: "",
      post_image_urls: [],
      image_local: [],
      interests: interests
   }
   }else{
    data = {
      post_author_name: "",
      post_url: "",
      post_date: "",
      post_description: "",   
      comment: "" 
   }
  }
   

   let date = '';
   try{
    if(selectedDateFlag){
      const dateExtracted = await page.evaluate(dateElement => dateElement.getAttribute("aria-label").trim().replace("•", ''),dateElement);
      date = await calculatePostDate(dateExtracted.replace("  Edited •", '').trim());
      console.log(date);
    }else{
      let dateExtracted = await page.evaluate(dateElement=>dateElement.textContent.trim(),dateElement);
      dateExtracted = dateExtracted.replace(' month ago','mo').replace(' months ago','mo').replace(' year ago','yr').replace(' years ago','yr').replace(' day ago','d').replace(' days ago','d').replace(' week ago','w').replace(' weeks ago','w').replace(' hour ago','h').replace(' hours ago','h');
      date = await calculatePostDate(dateExtracted.replace(" • Edited", '').trim());
      console.log(date);
    }
   }catch(e){
    date = '';
   }
  
  console.log('mfmmfm')
  let description = '';
  try{
  
    let selectedDescription = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.feed-shared-update-v2__description-wrapper>div>div`);
      
     if(!selectedDescription){
      selectedDescription = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div.feed-shared-update-v2>div>div.feed-shared-update-v2__description-wrapper>div>div`);
     }
     console.log(selectedDescription);
     description = await page.evaluate(selectedDescription=>selectedDescription.textContent.trim(),selectedDescription);
    }catch(e){
      description = '';
    }
  
  let authorName = '';
  try{
       
    let selectedAuthorName = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.update-components-actor>div>a`);
    
    if(!selectedAuthorName){
      selectedAuthorName = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div.feed-shared-update-v2>div>div.update-components-actor>div>a`);
    }
   
    authorName = await page.evaluate(selectedAuthorName=>selectedAuthorName.getAttribute('aria-label'),selectedAuthorName);
  }catch(e){
    authorName = '';
  }

  let imageUrls = [];


  if(!commentFlag){
    try{

      let iframeElement = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.update-components-document__container>div.document-s-container>iframe`);

      if(!iframeElement){
        iframeElement = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div.feed-shared-update-v2>div>div.update-components-document__container>div.document-s-container>iframe`);
      }
 
      const frame = await iframeElement.contentFrame();

      await delay(1500);
      const imageUrlsElements = await frame.$$('ul.carousel-track>li>img');
      for(const imageUrlElement of imageUrlsElements){
        const imageUrl = await frame.evaluate(imageUrlElement=>imageUrlElement.getAttribute('data-src'),imageUrlElement);
        imageUrls.push(imageUrl);
      }      
    }catch(e){
      try{
        let imageElements = [];
        imageElements = await page.$$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div>div.update-components-image>div>div>button>div>div>img`);
        if(imageElements.length == 0){
          imageElements = await page.$$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.update-components-image>div>div>button>div>div>img`)
        }
        for(const imageElement of imageElements){
          const imageUrl = await page.evaluate(imageElement => imageElement.getAttribute('src'),imageElement);
          imageUrls.push(imageUrl);
        }
      }catch(e){
        imageUrls = [];
      }
    }
  }
  let comment = '';
  if(commentFlag){
    try{
      let commentElement = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div.feed-shared-update-v2>div>div.update-v2-social-activity>div.feed-shared-update-v2__comments-container>div.comments-comments-list>div:nth-child(1)>article>div.comments-comment-item-content-body>div`);
      if(!commentElement){
        commentElement = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.update-v2-social-activity>div.feed-shared-update-v2__comments-container>div.comments-comments-list>div:nth-child(1)>article>div.comments-comment-item-content-body>div`);
      }
      comment = await page.evaluate(commentElement=>commentElement.textContent.trim(),commentElement);
    }catch(e){
      comment = '';
    }

  }



  let postUrl = '';
  try{
      let shareBtn = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div>div.feed-shared-update-v2>div>div.feed-shared-control-menu>div>button`);
      if(!shareBtn){
        shareBtn = await page.$(`ul.list-style-none>li:nth-child(${idx+1})>div>div>div:nth-child(2)>div.feed-shared-update-v2>div>div.feed-shared-control-menu>div>button`);
      }
   
      await shareBtn.evaluate(shareBtn => shareBtn.click());
      await delay(2000);
      const copyLink = await page.$("div>div>div>div>div>div.feed-shared-control-menu>div>div>div>ul>li.feed-shared-control-menu__item.option-share-via>div");
      await copyLink.evaluate(copyLink => copyLink.click());
      await delay(1000);

      await page.waitForSelector("div.artdeco-toast-item.artdeco-toast-item--visible>div>p>a")
      const linkHref = await page.$("div.artdeco-toast-item.artdeco-toast-item--visible>div>p>a");
      postUrl = await linkHref.evaluate(linkHref => linkHref.getAttribute('href'));
    }catch(e){
      console.log('no share button')
      postUrl = '';
    }

    if(!commentFlag){
      data.post_author_name = authorName;
      data.post_description = description;
      data.post_url = postUrl;
      data.post_date = date;
      data.post_image_urls = imageUrls;
    }
    else{
      data.post_author_name = authorName;
      data.post_description = description;
      data.post_url = postUrl;
      data.post_date = date;
      data.comment = comment;
    }

    const specifiedYearDate = new Date();
    specifiedYearDate.setFullYear(specifiedYearDate.getFullYear() - specified_year);
    const postDate = new Date(data.post_date);

    if (postDate <= specifiedYearDate) {
      console.log(`Encountered a post from ${specified_year} years ago. Stopping scraping.`);
      break;
    }else{
      if(!commentFlag){
        if (data.post_image_urls != []) {
          let image_idx = 1;
          let image_local = [];
          for (const image of data.post_image_urls) {     
            let image_path = `./output/${profile_url.split("/")[4]}post_${idx+1}/image${image_idx}.jpg`;
     
            image_local.push(image_path);
            await downloadFile(image, image_path);
            image_idx++;
          }
          data.image_local = image_local;
        }
      }

    }
    // axios.post(webhookUrl, data)
    // .then(function (response) {
    //   console.log('Data sent to webhook successfully:', response.data);
    // })
    // .catch(function (error) {
    //   console.error('Error sending data to webhook:', error);
    // });


    console.log(data);
    idx = idx + 1;

  }

}


async function scrapePosts(page,interests) {
  await page.goto(profile_url+"recent-activity/all");
  console.log('meow')
  await delay(2000);

  // await autoScroll(page);
  // await autoScroll(page);
  // await autoScroll(page);

  let selectedDate = [];
  let selectedDateFlag = true;
  selectedDate = await page.$$("div.feed-shared-update-v2>div>div.update-components-actor>div>div>a:nth-child(2)"); //aria-label

  if(selectedDate.length == 0){
    selectedDate = await page.$$("div.feed-shared-update-v2>div>div>div.ml4.mt2.text-body-xsmall");
    selectedDateFlag =  false;
  }
  console.log(selectedDate);
  let commentFlag = false;
  await extract(page,selectedDate,interests,selectedDateFlag,commentFlag);

}



const specified_year = 3;

const crawler = new PuppeteerCrawler({
  async requestHandler({ request, page, enqueueLinks, log }) {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    );

    await login(page);
    
    let page2 = await page.browser().newPage();
    await delay(500);
    let interests = await scrapeInterests(page2);
    await page2.close();
    await delay(500);

    await scrapePosts(page,interests);

    let page3 = await page.browser().newPage();
    await delay(500);
    await scrapeComments(page3,interests);
    await page3.close();
    await delay(500);
    

    
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