import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', fullyParallel:false, workers:2, retries:0, timeout:30000,
  reporter: process.env.CI ? [['list'],['html',{open:'never'}]] : 'list',
  use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},hasTouch:true}},
    {name:'webkit',use:{...devices['iPhone 13']}}
  ],
  webServer:{command:'npm run dev',url:'http://127.0.0.1:3000/healthz',reuseExistingServer:!process.env.CI,timeout:60000}
});
