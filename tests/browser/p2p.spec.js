import { test, expect } from '@playwright/test';

test('static P2P mode keeps the original solo drawing and renders offline exchange controls',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/p2p.html');
  await page.getByRole('button',{name:'すぐに おえかきする ✧'}).click();
  await page.mouse.move(80,350);await page.mouse.down();
  await page.mouse.move(280,430,{steps:14});await page.mouse.up();
  await expect(page.locator('#sky')).toHaveAttribute('data-points',/[1-9]/);
  await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();
  await expect(page.locator('#p2p-host')).toBeVisible();
  await expect(page.locator('#p2p-guest')).toBeVisible();
  expect(errors).toEqual([]);
});
test('two browsers exchange offline offers and connect over direct WebRTC',async({page,browser})=>{
  const child=await browser.newPage();
  try{
    await Promise.all([page.goto('/p2p.html'),child.goto('/p2p.html')]);
    await page.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();
    await child.getByRole('button',{name:'みんなであそぶ・おとなの設定'}).click();
    await page.locator('#p2p-host').click();
    await expect(page.locator('#p2p-outgoing')).toHaveValue(/^pc1\./,{timeout:18000});
    const offer=await page.locator('#p2p-outgoing').inputValue();
    await child.locator('#p2p-guest').click();
    await child.locator('#p2p-incoming').fill(offer);
    await child.locator('#p2p-apply').click();
    await expect(child.locator('#p2p-outgoing')).toHaveValue(/^pc1\./,{timeout:18000});
    const answer=await child.locator('#p2p-outgoing').inputValue();
    await page.locator('#p2p-incoming').fill(answer);
    await page.locator('#p2p-apply').click();
    await expect(page.locator('#universe')).toHaveAttribute('data-connection','joined',{timeout:18000});
    await expect(child.locator('#universe')).toHaveAttribute('data-connection','joined',{timeout:18000});
    await page.mouse.move(80,350);await page.mouse.down();
    await page.mouse.move(260,430,{steps:14});await page.mouse.up();
    await expect(child.locator('#sky')).toHaveAttribute('data-remote-points',/[1-9]/);
    await child.mouse.move(80,350);await child.mouse.down();
    await child.mouse.move(260,430,{steps:14});await child.mouse.up();
    await expect(page.locator('#sky')).toHaveAttribute('data-remote-points',/[1-9]/);
  }finally{await child.close();}
});
