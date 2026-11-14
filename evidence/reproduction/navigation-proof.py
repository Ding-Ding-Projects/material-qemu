import sys,json,secrets
from playwright.sync_api import sync_playwright,expect
code=sys.stdin.read().strip();origin="http://localhost:8080"
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={"width":1440,"height":1000},reduced_motion="reduce")
 r=c.request.post(origin+"/api/setup",data={"name":"Navigation fixture","password":secrets.token_urlsafe(24)},headers={"Origin":origin,"X-Setup-Token":code});assert r.ok
 h={"Origin":origin,"X-CSRF-Token":r.json()["csrf"]};assert c.request.post(origin+"/api/preferences",data={"setup":{"step":8,"complete":True}},headers=h).ok
 page=c.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)));page.goto(origin)
 page.locator("[role=tab][data-action='page:settings']").click()
 page.locator("[data-action='pin-tab:settings']").click();assert page.locator("[data-action='close-tab:settings']").is_disabled()
 page.locator("[data-action='pin-tab:settings']").click();page.locator("[data-action='close-tab:settings']").click();page.reload()
 assert page.locator("[role=tab][data-action='page:settings']").count()==0
 page.locator("[data-action=new-tab]").click();page.locator("#command-search").fill("settings")
 page.locator("[data-action='command-run:route%3Asettings']").click()
 assert page.locator("[role=tab][data-action='page:settings']").count()==1
 page.locator("[data-action=new-tab]").click();page.locator("#command-search").fill("settings");page.locator("[data-action='command-run:route%3Asettings']").click()
 assert page.locator("[role=tab][data-action='page:settings']").count()==1
 page.keyboard.press("Control+Shift+F");page.locator("#command-search").wait_for();page.locator("#palette-theme").select_option("light")
 expect(page.locator("html")).to_have_attribute("data-theme","light")
 page.keyboard.press("Escape");page.locator("#dialog").wait_for(state="hidden")
 page.locator("[data-action='pin-tab:overview']").click();page.locator("[data-action='close-tab:overview']").click()
 assert page.locator("[role=tab][data-action='page:overview']").count()==0
 page.reload();page.locator("[role=tab]").first.wait_for()
 closed=page.locator("[role=tab][data-action='page:overview']").count()==0
 print(json.dumps({"pinnedTabProtected":True,"closedSettingsSurvivesReload":True,"catalogReopensWithoutDuplicates":True,"paletteLiveTheme":True,"closedOverviewSurvivesReload":closed,"pageErrors":errors}))
 assert closed,'Explicitly closed Overview reopened after reload'
 page.locator("[role=tab][data-action='page:machines']").click()
 page.locator("[data-action=new-tab]").focus();page.wait_for_timeout(5500)
 retained=page.locator("[data-action=new-tab]").evaluate("e=>e===document.activeElement")
 print(json.dumps({"keyboardFocusSurvivesLiveRefresh":retained}))
 assert retained,"Live refresh lost keyboard focus"
 assert not errors,errors
 b.close()
