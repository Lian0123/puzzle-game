const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
test('lobby and game dialogs meet WCAG AA automated checks',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/');
  const audit=async()=>{
    await page.locator('dialog[open]').evaluateAll(async dialogs=>{await Promise.all(dialogs.flatMap(dialog=>dialog.getAnimations({subtree:true})).filter(animation=>Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});
    return new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  };
  expect((await audit()).violations).toEqual([]);
  await page.locator('#shopButton').click();expect((await audit()).violations).toEqual([]);await page.locator('#featureClose').click();
  await page.locator('#continueButton').click();await expect(page.locator('#gameOverlay')).toBeVisible();expect((await audit()).violations).toEqual([]);
  await page.locator('#pauseButton').click();expect((await audit()).violations).toEqual([]);
});
test('keyboard focus remains within game and returns home',async({page})=>{
  await page.goto('/');await page.locator('#continueButton').click();
  await page.locator('#hintButton').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement.closest('#gameOverlay')))).toBeTruthy();
  await page.locator('#closeButton').click();await expect(page.locator('#continueButton')).toBeFocused();
  await page.locator('#continueButton').click();await page.locator('#previewButton').click();await page.locator('#featureClose').click();await page.locator('#closeButton').click();await expect(page.locator('#continueButton')).toBeFocused();
});

test('expanded worlds, collection and completion dialog pass WCAG AA checks',async({page},info)=>{
  test.setTimeout(90000);await page.goto('/');
  await page.evaluate(()=>{
    localStorage.setItem('shijing-records',JSON.stringify(Object.fromEntries(Array.from({length:699},(_,i)=>[`${i}-4`,{time:60,moves:20}]))));
    localStorage.setItem('shijing-active-session',JSON.stringify({current:699,size:4,pieces:[1,0,...Array.from({length:14},(_,i)=>i+2)],moves:2,seconds:20,hints:2}));
  });await page.reload();
  const audit=async()=>{await page.locator('dialog[open]').evaluateAll(async dialogs=>{await Promise.all(dialogs.flatMap(dialog=>dialog.getAnimations({subtree:true})).filter(animation=>Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});return new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();};
  await expect(page.locator('#mapChapterTitle')).toHaveText('金色花園');expect((await audit()).violations).toEqual([]);
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`qa/${info.project.name}-nouveau-map.png`,fullPage:true,animations:'disabled',scale:'css'});
  for(const [world,chapter,name] of [[5,25,'technology'],[6,30,'nouveau']]){await page.locator(`[data-world="${world}"]`).click();await page.locator(`[data-chapter="${chapter}"]`).click();expect((await audit()).violations).toEqual([]);await page.screenshot({path:`qa/${info.project.name}-${name}-map.png`,fullPage:true,animations:'disabled',scale:'css'});}
  await page.locator('#collectionButton').click();expect((await audit()).violations).toEqual([]);await page.locator('#featureClose').click();
  await page.locator('#continueButton').click();await page.locator('.tile').nth(0).click();await page.locator('.tile').nth(1).click();await expect(page.locator('#winOverlay')).toBeVisible();expect((await audit()).violations).toEqual([]);
});
