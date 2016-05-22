'use strict';

require('isomorphic-fetch');
const mkdirp = require('mkdirp-promise');
const promiseRateLimit = require('promise-ratelimit');
const fs = require('fs');
const path = require('path');
const ProgressBar = require('progress');
const config = require('./config');

// Server indexes
const servers = ['a', 'b', 'c'];
let srvIdx = 0;
function getNextServer() {
  srvIdx++;
  if (srvIdx >= servers.length) {
    srvIdx = 0;
  }
  return servers[srvIdx];
}

// Generate tasks
const tasks = [];
for (let z = config.minZoom || 0; z <= config.maxZoom || 0; z++) {
  const size = Math.pow(2, z);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      tasks.push({
        s: getNextServer(),
        z, x, y,
      });
    }
  }
}

// Task performer
const throttle = promiseRateLimit(config.rateLimit || 100);
const bar = new ProgressBar(':bar', {
  total: tasks.length,
  width: 40,
});
const extName = path.extname(config.tileUrl);
function doTask(task) {
  return throttle().then(() => {
    const writeDir = path.join(
      config.outputDir, String(task.z), String(task.x)
    );
    return mkdirp(writeDir);
  }).then(() => {
    const url = config.tileUrl
      .replace('{s}', task.s)
      .replace('{z}', task.z)
      .replace('{x}', task.x)
      .replace('{y}', task.y)
    ;
    return fetch(url);
  }).then(response => {
    const writePath = path.join(
      config.outputDir,
      String(task.z), String(task.x), String(task.y)
    ) + extName;
    const writeStream = fs.createWriteStream(writePath);
    response.body.pipe(writeStream);
    return new Promise((resolve, reject) => {
      writeStream.on('error', reject);
      writeStream.on('close', resolve);
    });
  }).then(() => {
    bar.tick();
    return;
  });
}

// Run tasks
Promise.all(tasks.map(task => doTask(task))).then(() => {
  console.log('done.');
}).catch(err => {
  console.log(err);
});
