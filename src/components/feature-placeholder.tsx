"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CalendarClock, HeartPulse, Languages, MapPin, UsersRound } from "lucide-react";

type Feature = "map" | "routine" | "profile" | "sos";
type Language = "uz" | "ru";

const featureInfo = {
  uz: {
    map: { title: "Tibbiy muassasalar", description: "Farg‘onadagi klinika, shifoxona va dorixonalarni ko‘rsatadigan xarita shu yerda bo‘ladi.", status: "Xarita tayyorlanmoqda", Icon: MapPin },
    routine: { title: "Dori eslatmalari", description: "Dori qabul qilish va tibbiy qabullar jadvalini shu yerda ko‘rishingiz mumkin bo‘ladi.", status: "Eslatmalar tayyorlanmoqda", Icon: CalendarClock },
    profile: { title: "Yaqinlar va yordam kontaktlari", description: "Bu yerda ishonchli kontaktlar va qulaylik sozlamalarini boshqarish mumkin bo‘ladi.", status: "Profil tayyorlanmoqda", Icon: UsersRound },
    sos: { title: "SOS yordam", description: "Bu bo‘lim keyingi bosqichda favqulodda yordam ssenariylarini ko‘rsatadi.", status: "Ishlab chiqilmoqda", Icon: HeartPulse },
    back: "Bosh sahifaga qaytish",
    language: "РУССКИЙ",
  },
  ru: {
    map: { title: "Медицинские учреждения", description: "Здесь появится карта клиник, больниц и аптек Ферганы.", status: "Карта готовится", Icon: MapPin },
    routine: { title: "Напоминания о лекарствах", description: "Здесь можно будет просматривать расписание лекарств и медицинских приёмов.", status: "Напоминания готовятся", Icon: CalendarClock },
    profile: { title: "Близкие и контакты помощи", description: "Здесь можно будет управлять доверенными контактами и настройками доступности.", status: "Профиль готовится", Icon: UsersRound },
    sos: { title: "Экстренная помощь", description: "На следующем этапе здесь появятся дополнительные сценарии экстренной помощи.", status: "В разработке", Icon: HeartPulse },
    back: "Вернуться на главную",
    language: "O‘ZBEKCHA",
  },
};

export default function FeaturePlaceholder({ feature }: { feature: Feature }) {
  const [language, setLanguage] = useState<Language>("uz");
  const copy = featureInfo[language];
  const item = copy[feature];
  const Icon = item.Icon;

  return (
    <main className="feature-placeholder-page">
      <header className="simple-header">
        <Link href="/" className="simple-brand" aria-label="CareMate">
          <span className="simple-brand-icon"><HeartPulse size={30} /></span>
          <span><strong>CareMate</strong><small>SMART HEALTHCARE</small></span>
        </Link>
        <button className="language-switch" onClick={() => setLanguage(language === "uz" ? "ru" : "uz")}>
          <Languages size={22} /><span>{copy.language}</span>
        </button>
      </header>
      <section className="feature-placeholder-card">
        <div className="feature-placeholder-icon"><Icon size={42} /></div>
        <p className="welcome-kicker">CareMate</p>
        <h1>{item.title}</h1>
        <p className="feature-placeholder-description">{item.description}</p>
        <div className="feature-placeholder-status">{item.status}</div>
        <Link href="/" className="feature-back-button"><ArrowLeft size={25} /><span>{copy.back}</span></Link>
      </section>
    </main>
  );
}
