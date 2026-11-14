import sys,json,secrets,datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright,expect
code=sys.stdin.read().strip();password=secrets.token_urlsafe(24);origin="http://localhost:8080"
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={"width":360,"height":900},timezone_id="America/Toronto",reduced_motion="reduce")
 r=c.request.post(origin+"/api/setup",data={"name":"Mode fixture","password":password},headers={"Origin":origin,"X-Setup-Token":code});assert r.ok;csrf=r.json()["csrf"]
 h={"Origin":origin,"X-CSRF-Token":csrf};assert c.request.post(origin+"/api/preferences",data={"setup":{"step":8,"complete":True}},headers=h).ok
 other=b.new_context(storage_state=c.storage_state());page=c.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 cdp=c.new_cdp_session(page);cdp.send("WebAuthn.enable");cdp.send("WebAuthn.addVirtualAuthenticator",{"options":{"protocol":"ctap2","transport":"internal","hasResidentKey":True,"hasUserVerification":True,"isUserVerified":True,"automaticPresenceSimulation":True}})
 page.goto(origin);page.locator("[data-action='page:settings']").first.click();assert page.locator("[data-action=password-mode]").is_disabled()
 metadata=page.locator(".topbar .brand-meta");assert metadata.is_visible();s=c.request.get(origin+"/api/state").json();expected=datetime.datetime.fromisoformat(s["updatedAt"].replace("Z","+00:00")).astimezone(ZoneInfo("America/Toronto")).strftime("%Y-%m-%d %H:%M:%S")
 assert expected in metadata.inner_text() and "America/Toronto" in metadata.inner_text()
 assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
 page.locator("[data-action=register-passkey]").click();expect(page.locator("[data-action=password-mode]")).to_be_enabled()
 page.locator("[data-action=password-mode]").click();page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 assert c.request.get(origin+"/api/state").json()["owner"]["passwordEnabled"]==False
 assert other.request.get(origin+"/api/state").status==200
 assert other.request.post(origin+"/api/security",data={"passwordEnabled":True},headers=h).status==403
 anon=p.request.new_context(extra_http_headers={"Origin":origin})
 assert anon.post(origin+"/api/login",data={"username":"Mode fixture","password":password}).status==403
 page.locator("[data-action=logout]").click();page.locator("#auth-form").wait_for();assert page.locator("#password").is_disabled()
 page.locator("[data-action=passkey-login]").click();page.locator("[data-action=logout]").wait_for()
 page.locator("[data-action='page:settings']").first.click();page.locator("[data-action=password-mode]").click();page.locator("#dialog-form button[type=submit]").click();page.locator("#dialog").wait_for(state="hidden")
 assert c.request.get(origin+"/api/state").json()["owner"]["passwordEnabled"]==True
 assert anon.post(origin+"/api/login",data={"username":"Mode fixture","password":password}).status==200
 assert not errors,errors
 print(json.dumps({"requiresEnrolledCredential":True,"freshVirtualAuthenticatorDisablesAndReenables":True,"disabledPasswordRejected":True,"passkeySignInWorksWhilePasswordDisabled":True,"existingSessionPreserved":True,"passwordSessionCannotChangeMode":True,"narrowLocalBuildProvenance":True,"pageErrors":errors}))
 anon.dispose();other.close();b.close()
