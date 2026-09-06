# วิธีอัปโค้ดเข้า Apps Script ร้าน (ไม่ต้องก๊อปวางมือแล้ว)

> สำหรับแชท Claude บนเครื่องคุณปาล์ม (`D:\olddays-hq`) — เครื่องต้องมี Node.js
> scriptId อยู่ใน `.clasp.json` ที่ root repo แล้ว (โปรเจกต์ GAS ที่ผูกชีต OldDaysSystem)

## ครั้งแรกครั้งเดียว
```bash
npx @google/clasp login        # เปิดเบราว์เซอร์ให้คุณปาล์มกดอนุญาตบัญชี palm.work2026
```
แล้วเปิด https://script.google.com/home/usersettings เปิดสวิตช์ **Google Apps Script API** ด้วย

## ทุกครั้งที่จะอัปโค้ด (หลัง git pull ได้โค้ดใหม่)
```bash
npx @google/clasp push -f      # อัป gas/Code.gs ขึ้น HEAD → trigger 15 นาทีใช้ทันที
npx @google/clasp deploy -i AKfycby2_B4WghRRgjtDoS7ldaOlbcfnay6mtmAxkHmDNazs8xg-We5maajEIZ8KwoFROD6RZw -d "จาก repo"
```
บรรทัดที่สอง = กด "New version" ให้ deployment เดิม (URL ไม่เปลี่ยน webhook ไม่พัง) — ปุ่มในแอปจะได้ใช้โค้ดใหม่ด้วย

⚠️ ห้ามใช้ `clasp pull` — มันจะเอาโค้ดเก่าใน GAS มาทับ `gas/Code.gs` ใน repo
⚠️ ฟังก์ชันที่ต้องรันมือ (เช่น `seedHistoricalCloses`, `setupImportTrigger`) ยังต้องกด Run ใน editor เหมือนเดิม
