import sys,json,secrets
from playwright.sync_api import sync_playwright,expect
code=sys.stdin.read().strip()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={"width":1440,"height":1000},reduced_motion="reduce");origin="http://localhost:8080"
 r=c.request.post(origin+"/api/setup",data={"name":"Lifecycle fixture","password":secrets.token_urlsafe(24)},headers={"Origin":origin,"X-Setup-Token":code});assert r.ok
 h={"Origin":origin,"X-CSRF-Token":r.json()["csrf"]}
 assert c.request.post(origin+"/api/preferences",data={"setup":{"step":8,"complete":True}},headers=h).ok
 r=c.request.post(origin+"/api/machines",data={"name":"Retained machine","arch":"x86_64","memory":128,"cpus":1,"diskGiB":1,"network":"none","startAfterCreate":True},headers=h);assert r.ok;mid=r.json()["id"]
 page=c.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)));page.goto(origin);page.locator("[data-action='page:machines']").first.click();page.locator(f"[data-action='details:{mid}']").first.click()
 page.locator(f"[data-action='tags:{mid}']").click();page.locator("#tags").fill("verified, retained");page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 assert c.request.get(origin+"/api/state").json()["machines"][0]["tags"]==["verified","retained"]
 page.locator("[data-action='toggle-folder:']").click();expect(page.locator("[data-action='toggle-folder:']")).to_have_attribute("aria-expanded","false")
 page.reload();page.locator("[data-action='page:machines']").first.click();expect(page.locator("[data-action='toggle-folder:']")).to_have_attribute("aria-expanded","false")
 page.locator("[data-action='toggle-folder:']").click();page.locator(f"[data-action='details:{mid}']").first.click()
 def remove():
  page.locator(f"[data-action='remove:{mid}']").click();page.locator("#confirmName").fill("Retained machine");page.locator("#dialog-form button[type=submit]").click();page.get_by_role("heading",name="Removal results",exact=True).wait_for()
 remove();assert "Stop the machine" in page.locator("#dialog").inner_text();page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 assert c.request.post(origin+f"/api/machines/{mid}/action",data={"action":"stop"},headers=h).ok
 remove();assert "disk retained" in page.locator("#dialog").inner_text();page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 s=c.request.get(origin+"/api/state").json();assert not s["machines"] and s["removedMachines"][0]["id"]==mid
 page.locator("[data-action=removed-machines]").click();page.locator(f"[data-action='restore:{mid}']").click();page.locator("#dialog").wait_for(state="hidden")
 s=c.request.get(origin+"/api/state").json();assert s["machines"][0]["id"]==mid and s["machines"][0]["state"]=="stopped" and not s["removedMachines"]
 assert not errors,errors
 print(json.dumps({"tagsPersist":True,"folderCollapsePersists":True,"runningRemovalRejected":True,"stoppedRemovalArchived":True,"sameIdentityRestoredStopped":True,"pageErrors":errors}))
 b.close()
