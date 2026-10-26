// ===================== ตั้งค่าระบบ =====================
// 1) วางค่า Firebase config ของโปรเจกต์ (Firebase console > Project settings > Your apps > Web app)
// 2) ถ้า apiKey ว่าง ระบบจะทำงานใน "โหมดสาธิต" เก็บข้อมูลไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const SURVEY = {
  year: "2569",                       // ปีการศึกษาที่สำรวจ (บันทึกลงทุกคำตอบ ใช้แยกรอบการสำรวจ)
  org: "มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์",
  title: "แบบสำรวจการใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน)",
  subtitle: "เพื่อการจัดการเรียนรู้โดยใช้การศึกษาทางไกลผ่านดาวเทียม (DLTV)",
  open: true,                         // false = ปิดรับคำตอบ
  closedMessage: "ขณะนี้ปิดรับแบบสำรวจแล้ว ขอบคุณที่ให้ความสนใจ"
};
