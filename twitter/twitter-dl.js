import puppeteer from 'puppeteer';
import axios from 'axios';
import AsyncRetry from 'async-retry';
import { setTimeout } from 'timers/promises';

async function getVideoUrl(tweetUrl) {
  const userId = tweetUrl.match(/\d+$/);
  const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${userId}`;

  let fetchResponse;
  await AsyncRetry(async (bail) => {
    fetchResponse = await getTweetResult(embedUrl);
  }, { retries: 5, onRetry: () => { console.log("Retrying..."); } });

  let body = await fetchResponse;
  let variantArray = body.data.video.variants;
  let mp4Url = identifyBestVariant(variantArray);
  return mp4Url;
}

async function getTweetResult(embedUrl) {
  const config = {
    'offline': false,
    'downloadThroughput': 0,
    'uploadThroughput': 0,
    'latency': 22,
    args: ['--disable-cache'],
    headless: "new",
  };
  const browser = await puppeteer.launch(config);
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36');

  let myTweetResult = null;

  await page.setRequestInterception(true);
  page.on("request", (interceptedRequest) => {
    if (interceptedRequest.url().includes("https://cdn.syndication.twimg.com/tweet-result")) {
      myTweetResult = axios.get(interceptedRequest.url());
    }
    interceptedRequest.continue();
  });

  page.on("response", (response) => {
    let url = response.url();
  });

  let error_object = null;

  const timer = setTimeout(() => {}, 3000);
  timer.then(() => {
    error_object = new Error("Timed out!");
  });

  await page.goto(embedUrl);

  while (myTweetResult == null) {
    if (error_object) {
      browser.close();
      throw error_object;
    }
  }
  clearTimeout(timer);
  browser.close();
  return myTweetResult;
}

function identifyBestVariant(variantArray) {
  let filtered_variant_array = new Array();
  for (let x of variantArray) {
    if (x.src.includes("mp4") && x.type == "video/mp4") {
      filtered_variant_array.push(x);
    }
  }
  let mp4Url = filtered_variant_array[0].src;
  return mp4Url;
}

export { getVideoUrl };
