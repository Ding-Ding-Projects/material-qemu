import sys,secrets,json,datetime,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
code=sys.stdin.read().strip()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={"width":1440,"height":1000},reduced_motion="reduce");page=c.new_page();errors=[]
 page.on("pageerror",lambda e:errors.append(str(e)))
 page.goto("http://localhost:8080/");page.locator("#owner").fill("Setup fixture");page.locator("#bootstrap").fill(code);page.locator("#password").fill(secrets.token_urlsafe(24));page.locator("#auth-form button[type=submit]").click()
 page.locator("[data-action=setup-next]").wait_for()
 for _ in range(5):
  page.locator("[data-action=setup-next]").click();page.wait_for_timeout(150)
 page.locator("[data-action=setup-create]").click();page.locator("#name").fill("Onboarding machine")
 page.locator("[data-action=wizard-next]").click();page.locator("[data-action=wizard-next]").click();page.locator("#cpus").fill("1");page.locator("#memory").fill("128")
 page.locator("[data-action=wizard-next]").click();page.locator("[data-action=wizard-next]").click();page.locator("#diskGiB").fill("1")
 for _ in range(3):page.locator("[data-action=wizard-next]").click()
 page.locator("[data-action=wizard-create]").click();page.locator("[data-action=setup-finish]").wait_for()
 s=c.request.get("http://localhost:8080/api/state").json();assert s["setup"]["step"]==8 and not s["setup"]["complete"] and len(s["machines"])==1
 page.locator("[data-action=setup-finish]").click();page.locator("[data-action=new]").first.wait_for()
 s=c.request.get("http://localhost:8080/api/state").json();assert s["setup"]["complete"] and s["machines"][0]["state"]=="stopped"
 assert not errors,errors
 print(json.dumps({"firstMachineInSetup":True,"returnsToStep8":True,"completionOpensWorkspace":True,"noImplicitStartup":True,"pageErrors":errors}))
 b.close()
