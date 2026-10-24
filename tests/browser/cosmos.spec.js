import { test, expect } from '@playwright/test';

async function draw(page,from=[80,350],to=[280,440]) {
  await page.mouse.move(...from);await page.mouse.down();await page.mouse.move(...to,{steps:12});await page.mouse.up();
}
async function pair({page,browser},testInfo) {
  await page.goto('/');await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();await page.getByRole('button',{name:'みんなの宇宙をつくる',exact:true}).click();
  await expect(page.locator('#universe')).toHaveAttribute('data-connection','joined');
  const link=await page.locator('#invite-url').inputValue();
  const context=await browser.newContext({...testInfo.project.use,viewport:{width:375,height:667}});
  const guest=await context.newPage();await guest.goto(link);await guest.getByRole('button',{name:'いっしょに あそぶ ♪'}).click();
  await expect(guest.locator('#waiting-code')).toHaveText(/\d{2}/);
  const code=await guest.locator('#waiting-code').textContent();
  await page.getByRole('button',{name:`${code} の参加をOK`}).click();
  await expect(guest.locator('#universe')).toHaveAttribute('data-connection','joined');
  await page.getByRole('button',{name:'宇宙の設定を閉じる'}).click();
  await expect(page.locator('.crew-member')).toHaveCount(2);
  return {guest,context,link};
}

test('original story, animals, drawing, constellation and letter still work',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/きみのゆびから、.*うちゅうがうまれる。/})).toBeVisible();
  await page.getByRole('button',{name:/ほしを おこす/}).click();
  // The friends bob continuously by design; bypass Playwright's stability check while still dispatching a real pointer click.
  for(const animal of ['きつね','うさぎ','くま'])await page.getByRole('button',{name:`${animal}のほしを起こす`}).click({force:true});
  await page.getByRole('button',{name:/ほしの みちを つくる/}).click();await draw(page);
  await expect(page.locator('#sky')).toHaveAttribute('data-points',/[1-9]/);
  await expect(page.locator('#sky')).toHaveAttribute('data-notes-played',/[1-9]/);
  await page.getByRole('button',{name:/みんなで ひかろう/}).click();
  for(const star of await page.locator('.family-star').all())await star.click();
  await expect(page.locator('#ending')).toBeVisible({timeout:5000});
  await page.getByRole('button',{name:/おとなへの、ひみつの手紙/}).click();await expect(page.getByRole('dialog',{name:'この宇宙の、つづき。'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('solo quick play, touch tap and fixed canvas do not select or scroll',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'すぐに おえかきする ✧'}).click();
  await page.touchscreen.tap(75,360);await draw(page);
  expect(await page.evaluate(()=>({y:scrollY,selected:window.getSelection().toString(),touch:getComputedStyle(document.querySelector('#sky')).touchAction,select:getComputedStyle(document.querySelector('#universe')).userSelect}))).toEqual({y:0,selected:'',touch:'none',select:'none'});
  const count=Number(await page.locator('#sky').getAttribute('data-points'));expect(count).toBeGreaterThan(2);
  await page.setViewportSize({width:667,height:375});await expect(page.locator('#comet')).toBeInViewport();
});
test('parent approval, bidirectional drawing and actual audio scheduling',async({page,browser},info)=>{
  const {guest,context}=await pair({page,browser},info);
  try{
    const hostNotes=Number(await page.locator('#sky').getAttribute('data-notes-played')||0);
    const guestNotes=Number(await guest.locator('#sky').getAttribute('data-notes-played')||0);
    await draw(page);await expect(guest.locator('#sky')).toHaveAttribute('data-remote-points',/[1-9]/);
    await expect.poll(async()=>Number(await guest.locator('#sky').getAttribute('data-notes-played'))).toBeGreaterThan(guestNotes);
    await draw(guest,[60,320],[270,390]);await expect(page.locator('#sky')).toHaveAttribute('data-remote-points',/[1-9]/);
    await expect.poll(async()=>Number(await page.locator('#sky').getAttribute('data-notes-played'))).toBeGreaterThan(hostNotes);
    await Promise.all([draw(page,[70,370],[290,480]),draw(guest,[90,300],[280,390])]);
    await expect(page.locator('.visitor')).toHaveCount(1);await expect(guest.locator('.visitor')).toHaveCount(1);
    expect(await guest.evaluate(()=>location.hash)).toBe('');
    await page.getByRole('button',{name:'くじらを よぶ'}).click();await expect(guest.locator('#whale')).toBeVisible();
  }finally{await context.close();}
});
test('reload reconnects the same participant and audio resumes with a gesture',async({page,browser},info)=>{
  const {guest,context}=await pair({page,browser},info);
  try{
    const members=await guest.locator('.crew-member').evaluateAll(els=>els.map(e=>e.dataset.member));
    await guest.reload();await expect(guest.locator('#universe')).toHaveAttribute('data-connection','joined');
    expect(await guest.locator('.crew-member').evaluateAll(els=>els.map(e=>e.dataset.member))).toEqual(members);
    await guest.getByRole('button',{name:'音をオンにする',exact:true}).click();await draw(page);
    await expect(guest.locator('#sky')).toHaveAttribute('data-remote-points',/[1-9]/);
    await expect(guest.locator('#sky')).toHaveAttribute('data-notes-played',/[1-9]/);
    await expect(page.locator('.crew-member')).toHaveCount(2);
  }finally{await context.close();}
});
test('local names persist without entering requests or websocket messages',async({page})=>{
  const sent=[];page.on('websocket',ws=>ws.on('framesent',e=>sent.push(String(e.payload))));
  page.on('request',r=>{sent.push(r.url(),r.postData()||'');});
  await page.goto('/');await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();
  await page.locator('#local-settings summary').click();await page.locator('#star-name-0').fill('テスト星人');await page.getByRole('button',{name:'なまえを保存',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();await page.locator('#local-settings summary').click();
  await expect(page.locator('#star-name-0')).toHaveValue('テスト星人');
  await page.getByRole('button',{name:'みんなの宇宙をつくる',exact:true}).click();await expect(page.locator('#universe')).toHaveAttribute('data-connection','joined');
  expect(sent.join('\n')).not.toContain('テスト星人');
});
test('unapproved guest is denied and cannot render shared events',async({page,browser},info)=>{
  await page.goto('/');await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();await page.getByRole('button',{name:'みんなの宇宙をつくる',exact:true}).click();await expect(page.locator('#universe')).toHaveAttribute('data-connection','joined');
  const link=await page.locator('#invite-url').inputValue();const context=await browser.newContext({...info.project.use});const guest=await context.newPage();
  try{
    await guest.goto(link);await guest.getByRole('button',{name:'いっしょに あそぶ ♪'}).click();await expect(guest.locator('#waiting-code')).toHaveText(/\d{2}/);
    await page.getByRole('button',{name:'参加をことわる'}).click();await expect(guest.locator('#universe')).toHaveAttribute('data-connection','error');
    await page.getByRole('button',{name:'宇宙の設定を閉じる'}).click();await draw(page);
    expect(await guest.locator('#sky').getAttribute('data-remote-points')).toBe(null);
  }finally{await context.close();}
});
