import sys,json,secrets,time
from playwright.sync_api import sync_playwright
code=sys.stdin.read().strip()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={"width":1440,"height":1000},reduced_motion="reduce")
 origin="http://localhost:8080"
 setup=c.request.post(origin+"/api/setup",data={"name":"Chart fixture","password":secrets.token_urlsafe(24)},headers={"Origin":origin,"X-Setup-Token":code})
 assert setup.status==200
 headers={"Origin":origin,"X-CSRF-Token":setup.json()["csrf"]}
 assert c.request.post(origin+"/api/preferences",data={"setup":{"step":8,"complete":True}},headers=headers).ok
 assert c.request.post(origin+"/api/machines",data={"name":"Chart machine","arch":"i386","memory":128,"cpus":1,"diskGiB":1,"network":"none"},headers=headers).ok
 page=c.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)));page.goto(origin)
 page.locator("svg.history-chart.cpu polyline").wait_for(timeout=15000)
 first=c.request.get(origin+"/api/state").json()["metricHistory"]
 page.wait_for_timeout(2300)
 second=c.request.get(origin+"/api/state").json()["metricHistory"]
 assert len(second)>len(first) and len(second)<=90
 assert len(set(s["sampledAt"] for s in second))==len(second)
 page.locator("[data-action='overview-state:stopped']").click()
 page.locator("[data-action='overview-arch:i386']").click()
 page.reload();page.locator("svg.history-chart.cpu polyline").wait_for()
 assert page.locator("[data-action='overview-state:stopped']").get_attribute("aria-pressed")=="true"
 assert page.locator("[data-action='overview-arch:i386']").get_attribute("aria-pressed")=="true"
 page.set_viewport_size({"width":360,"height":900});page.wait_for_timeout(300)
 assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
 assert not errors,errors
 print(json.dumps({"actualHistoryGrows":True,"boundedHistory":True,"uniqueSampleTimes":True,"chartRendered":True,"overviewFiltersPersist":True,"narrowOverflow":False,"pageErrors":errors}))
 b.close()
