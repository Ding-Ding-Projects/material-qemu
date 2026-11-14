import sys,json,secrets,hashlib,struct,datetime,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
bootstrap=sys.stdin.read().strip()
shots=[]
def shot(page,name):
 page.wait_for_timeout(350)
 at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 raw=page.screenshot(path="/proof/"+name,full_page=True,animations="disabled")
 w,h=struct.unpack(">II",raw[16:24])
 shots.append({"path":name,"sha256":hashlib.sha256(raw).hexdigest(),"width":w,"height":h,"viewport":page.viewport_size,"scale":1,"theme":page.locator("html").get_attribute("data-theme"),"language":page.locator("html").get_attribute("lang"),"reducedMotion":True,"capturedAt":at,"inspected":False})
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 context=b.new_context(viewport={"width":1440,"height":1000}, reduced_motion="reduce")
 page=context.new_page(); errors=[]; resources=[]; request_urls=[]
 page.on("response",lambda r: resources.append({"url":r.url,"status":r.status}))
 page.on("request",lambda r: request_urls.append(r.url))
 cdp=context.new_cdp_session(page)
 cdp.send("WebAuthn.enable")
 cdp.send("WebAuthn.addVirtualAuthenticator",{"options":{"protocol":"ctap2","transport":"internal","hasResidentKey":True,"hasUserVerification":True,"isUserVerified":True,"automaticPresenceSimulation":True}})
 page.on("pageerror",lambda e: errors.append(str(e)))
 page.goto("http://localhost:8080/"); page.wait_for_selector("#auth-form")
 shot(page,"initial.png")
 session=context.request.get("http://localhost:8080/api/session").json()
 assert "bootstrap" not in session
 assert context.request.get("http://localhost:8080/api/state").status==401
 page.locator("#auth-theme").select_option("light")
 assert page.locator("html").get_attribute("data-theme")=="light"
 page.locator("#auth-language").select_option("both")
 page.locator("#auth-theme").select_option("dark")
 page.locator("#auth-language").select_option("en")
 page.locator("#owner").fill("Runtime verification")
 page.locator("#bootstrap").fill(bootstrap)
 password=secrets.token_urlsafe(24)
 page.locator("#password").fill(password)
 page.locator("#auth-form button[type=submit]").click()
 page.wait_for_selector("[data-action=setup-next]");shot(page,"onboarding.png")
 page.locator("[data-action=setup-save]").click();page.wait_for_selector("#auth-form")
 if page.locator("#username").count():page.locator("#username").fill("Runtime verification")
 page.locator("#password").fill(password);page.locator("#auth-form button[type=submit]").click()
 page.wait_for_selector("[data-action=setup-next]")
 assert context.request.get("http://localhost:8080/api/state").json()["setup"]["step"]==2
 print("Preauth preferences and save-later setup resume passed")
 for i in range(6):
  next=page.locator("[data-action=setup-next]")
  if next.count():
   skip=page.locator("[data-action=setup-skip]")
   (skip if skip.count() else next).click();page.wait_for_timeout(250)
 page.locator("[data-action=setup-finish]").click()
 page.wait_for_selector("[data-action=new]")
 page.wait_for_timeout(500)
 shot(page,"overview.png")
 page.locator("[data-action=new]").first.click()
 page.locator("#name").fill("Acceptance machine")
 page.locator("[data-action=wizard-next]").click()
 assert set(page.locator("#arch option").evaluate_all("es=>es.map(e=>e.value)")) >= {"x86_64","i386","aarch64","arm"}
 page.locator("#arch").select_option("i386")
 page.locator("#machineType").select_option("pc")
 page.locator("#accelerator").select_option("tcg")
 page.locator("[data-action=wizard-next]").click()
 page.locator("#cpus").fill("1");page.locator("#memory").fill("128")
 page.locator("[data-action=wizard-next]").click()
 page.reload();page.wait_for_selector("[data-action=logout]")
 if not page.locator("#machine-form").count():page.locator("[data-action='page:new']").first.click()
 page.get_by_role("heading",name="Firmware",exact=True).wait_for()
 print("Machine draft resumed at exact firmware step")
 page.locator("[data-action=wizard-next]").click()
 page.locator("#diskGiB").fill("1")
 page.locator("[data-action=import-iso]").click()
 page.locator("#isoFile").set_input_files({"name":"proof.iso","mimeType":"application/octet-stream","buffer":b"Upload transport fixture, not bootable installation media."})
 page.locator("#isoName").fill("proof.iso")
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 page.locator("#iso").select_option("")
 upload_state=context.request.get("http://localhost:8080/api/state").json()
 assert "proof.iso" in upload_state["media"]
 duplicate=context.request.post("http://localhost:8080/api/media?name=proof.iso",data=b"replacement",headers={"Origin":"http://localhost:8080","X-CSRF-Token":upload_state["csrf"],"Content-Type":"application/octet-stream"})
 assert duplicate.status==400
 print("Browser ISO upload and duplicate refusal passed")
 page.locator("[data-action=wizard-next]").click()
 page.locator("#network").select_option("none")
 page.locator("[data-action=wizard-next]").click()
 page.locator("[data-action=wizard-next]").click()
 page.locator("input[name=startAfterCreate]").check()
 page.locator("#command-preview").get_by_text("qemu-system",exact=False).wait_for()
 shot(page,"machine-review.png");page.locator("[data-action=wizard-create]").click()
 page.get_by_text("Acceptance machine",exact=True).first.wait_for()
 page.wait_for_timeout(500)
 data=context.request.get("http://localhost:8080/api/state").json()
 assert len(data["machines"])==1
 assert data["machines"][0]["arch"]=="i386" and data["machines"][0]["machineType"]=="pc"
 mid=data["machines"][0]["id"]
 assert data["machines"][0]["state"]=="running"
 print("Start-after-create opened live console")
 page.wait_for_selector("#vnc canvas",timeout=15000)
 page.wait_for_timeout(1000)
 for action in ["console-release","console-scale"]:
  page.locator(f"[data-action={action}]").focus();page.keyboard.press("Enter")
  assert page.locator(f"[data-action={action}]").get_attribute("aria-pressed")=="false"
 page.locator("[data-action=console-reconnect]").click();page.wait_for_timeout(1000)
 for action in ["console-release","console-scale"]:
  assert page.locator(f"[data-action={action}]").get_attribute("aria-pressed")=="false"
  page.locator(f"[data-action={action}]").click()
  assert page.locator(f"[data-action={action}]").get_attribute("aria-pressed")=="true"
 print("Console persistent input/scaling state and reconnect passed")
 shot(page,"console.png")
 headers={"Origin":"http://localhost:8080","X-CSRF-Token":data["csrf"]}
 for action,expected in [("pause","paused"),("resume","running")]:
  result=context.request.post(f"http://localhost:8080/api/machines/{mid}/action",data={"action":action},headers=headers)
  assert result.ok, result.text()
  assert result.json()["state"]==expected,result.text()
 for width in [360,1440]:
  page.set_viewport_size({"width":width,"height":900})
  page.locator("[data-action='page:machines']").first.click()
  page.wait_for_timeout(500)
  assert not page.evaluate("document.documentElement.scrollWidth>innerWidth"),str(width)
  shot(page,f"machines-{width}.png")
 result=context.request.post(f"http://localhost:8080/api/machines/{mid}/action",data={"action":"stop"},headers=headers)
 assert result.ok,result.text()
 print("Machine wizard, real QEMU start/pause/resume/stop and console canvas passed")
 page.locator("[data-action='page:settings']").first.click()
 page.locator("[data-action='register-passkey']").click()
 page.get_by_text("1 registered passkeys",exact=False).wait_for()
 page.locator("[data-action=logout]").click()
 page.wait_for_selector("[data-action=passkey-login]")
 page.locator("[data-action=passkey-login]").click()
 page.wait_for_selector("[data-action=logout]")
 print("WebAuthn virtual-authenticator registration and sign-in passed")
 page.locator("[data-action='page:machines']").first.click()
 page.locator("[data-action=folder]").click();page.locator("#folderName").fill("Proof folder")
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 auth=context.request.get("http://localhost:8080/api/state").json()
 headers={"Origin":"http://localhost:8080","X-CSRF-Token":auth["csrf"]}
 assert context.request.post(f"http://localhost:8080/api/machines/{mid}/action",data={"action":"start"},headers=headers).ok
 page.locator(f"[data-action='details:{mid}']").first.click()
 page.locator(f"[data-action='move:{mid}']").click()
 page.locator("#destination").select_option("Proof folder")
 page.locator("#dialog-form button[type=submit]").click()
 page.get_by_role("heading",name="Move results",exact=True).wait_for(timeout=3000)
 page.locator("#dialog-form button[type=submit]").click()
 page.locator("#dialog").wait_for(state="hidden")
 page.reload();page.wait_for_selector("[data-action=logout]")
 page.locator("[data-action='page:machines']").first.click()
 page.locator("[data-action='folder-filter:Proof folder']").click()
 page.locator("[data-action=save-view]").click();page.locator("#viewName").fill("Proof view")
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 page.locator("[data-action=manage-folders]").click()
 page.locator("[data-action='rename-folder:Proof folder']").click();page.locator("#folderName").fill("Renamed folder")
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 current=context.request.get("http://localhost:8080/api/state").json()
 assert current["machines"][0]["folder"]=="Renamed folder"
 assert current["views"][0]["folder"]=="Renamed folder"
 vid=current["views"][0]["id"]
 page.locator(f"[data-action='delete-view:{vid}']").click()
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 page.locator("[data-action=manage-folders]").click()
 page.locator("[data-action='delete-folder:Renamed folder']").click()
 page.locator("#confirmName").fill("Renamed folder");page.locator("input[name=unfiled]").check()
 page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 current=context.request.get("http://localhost:8080/api/state").json()
 assert len(current["machines"])==1 and current["machines"][0]["folder"]==""
 assert not current["views"] and not current["folders"]
 assert current["machines"][0]["state"]=="running"
 assert context.request.post(f"http://localhost:8080/api/machines/{mid}/action",data={"action":"stop"},headers=headers).ok
 page.locator("[data-action=folder]").focus();page.keyboard.press("Enter")
 page.locator("#folderName").wait_for();page.keyboard.press("Escape")
 assert page.locator("[data-action=folder]").evaluate("e=>e===document.activeElement")
 print("Folder rename/removal, saved-view deletion, retained machines and dialog keyboard restoration passed")
 action_sets={}
 for language in ["en","yue","both"]:
  for theme in ["dark","light"]:
   for width in [360,1440]:
    page.set_viewport_size({"width":width,"height":900})
    page.locator("[data-action='page:settings']").first.click()
    page.locator("#language").select_option(language);page.locator("#theme").select_option(theme)
    page.locator("[data-action=save-settings]").click()
    page.wait_for_timeout(300)
    page.locator("[data-action='page:machines']").first.click()
    page.wait_for_timeout(200)
    assert not page.evaluate("document.documentElement.scrollWidth>innerWidth"),(language,theme,width)
    action_sets[(language,theme,width)]=set(page.locator("[data-action]").evaluate_all("els=>els.filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e=>e.dataset.action)"))
    shot(page,f"matrix-{language}-{theme}-{width}.png")
 for language in ["en","yue","both"]:
  for theme in ["dark","light"]:
   assert action_sets[(language,theme,360)]==action_sets[(language,theme,1440)],(language,theme,"action inventory differs")
 page.reload();page.wait_for_selector("[data-action=logout]")
 verify=context.request.get("http://localhost:8080/api/state").json()
 assert verify["settings"]["language"]=="both" and verify["settings"]["theme"]=="light"
 print("12 language/theme/width tuples and preference reload passed")
 s=context.request.get("http://localhost:8080/api/state").json()
 assert s["setup"]["complete"]
 print(json.dumps({"setup":True,"availableTargets":[k for k,v in s["capabilities"].items() if v["available"]],"errors":errors,"overflow":page.evaluate("document.documentElement.scrollWidth>innerWidth")}))
 assert not [r for r in resources if r["status"]>=400 and "/api/" not in r["url"] and "favicon" not in r["url"]]
 assert not [u for u in request_urls if u.startswith("http") and not u.startswith("http://localhost:8080/")]
 assert any("woff2" in r["url"] and r["status"]==200 for r in resources)
 print("Bundled fonts loaded without external requests")
 anon=p.request.new_context(base_url="http://localhost:8080",extra_http_headers={"Origin":"http://localhost:8080"})
 for attempt in range(5):
  rejection=anon.post("/api/login",data={"username":"Runtime verification","password":"incorrect-fixture-only"})
  assert rejection.status==401,(attempt,rejection.status)
 assert anon.post("/api/login",data={"username":"Runtime verification","password":"incorrect-fixture-only"}).status==429
 assert context.request.get("http://localhost:8080/api/state").status==200
 anon.dispose()
 print("Five unsuccessful sign-ins block the sixth without disrupting an authenticated session")
 Path("/proof/browser-receipt.json").write_text(json.dumps({"schemaVersion":1,"route":"linux-container-playwright","source":os.environ["PROOF_SOURCE"],"image":os.environ["PROOF_IMAGE"],"browser":b.version,"isolatedContext":True,"screenshots":shots,"pageErrors":errors,"checks":["owner setup UI","onboarding UI","anonymous state rejection","setup credential absent from anonymous response","machine wizard UI","real QEMU start pause resume stop","live console canvas","360 and 1440 body overflow"]},indent=2))
 archive=Path("/proof/runs")/os.environ["PROOF_SOURCE"];archive.mkdir(parents=True,exist_ok=True)
 for item in shots:
  raw=Path("/proof")/item["path"]
  assert hashlib.sha256(raw.read_bytes()).hexdigest()==item["sha256"]
  shutil.copy2(raw,archive/item["path"])
 shutil.copy2("/proof/browser-receipt.json",archive/"browser-receipt.json")
 shutil.copy2("/proof/browser-proof.py",archive/"browser-proof.py")
 b.close()
