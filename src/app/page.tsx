"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  Accessibility,
  ArrowRight,
  Check,
  HeartPulse,
  Languages,
  MapPin,
  MessageCircle,
  PhoneCall,
  Pill,
  Siren,
  Type,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";

type Language = "uz" | "ru";

type PiperEngine = {
  sampleRate: number;
  speak: (text: string, options?: { lengthScale?: number; noiseScale?: number; noiseW?: number }) => Promise<Float32Array>;
};

type PiperWindow = Window & {
  ort?: unknown;
  createPiperPhonemize?: unknown;
  CareMatePiper?: {
    createEngine: (modelUrl: string, configUrl: string) => Promise<PiperEngine>;
    toWav: (samples: Float32Array, sampleRate: number) => Blob;
  };
  __careMatePiperEngine?: Promise<PiperEngine>;
};

let piperRuntimePromise: Promise<void> | null = null;

function loadScript(src: string, isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => {
      try { return new URL(script.src, window.location.href).pathname === src; }
      catch { return false; }
    });
    const script = existing ?? document.createElement("script");

    if (existing?.dataset.loaded === "true") {
      if (isReady()) resolve();
      else reject(new Error(`Script loaded but did not initialize: ${src}`));
      return;
    }

    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      script.dataset.loaded = "true";
      cleanup();
      if (isReady()) resolve();
      else reject(new Error(`Script did not initialize: ${src}`));
    };
    const onError = () => {
      cleanup();
      script.remove();
      reject(new Error(`Could not load script: ${src}`));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

async function ensurePiperRuntime(): Promise<void> {
  const browserWindow = window as PiperWindow;
  if (browserWindow.ort && browserWindow.createPiperPhonemize && browserWindow.CareMatePiper) return;
  if (!piperRuntimePromise) {
    piperRuntimePromise = (async () => {
      await loadScript("/vendor/ort/ort.wasm.min.js", () => Boolean((window as PiperWindow).ort));
      await loadScript("/vendor/phonemize/piper_phonemize.js", () => Boolean((window as PiperWindow).createPiperPhonemize));
      await loadScript("/piper-browser.js", () => Boolean((window as PiperWindow).CareMatePiper));
    })().catch((error) => {
      piperRuntimePromise = null;
      throw error;
    });
  }
  await piperRuntimePromise;
}

const copy = {
  uz: {
    lang: "O‘zbekcha",
    welcome: "Assalomu alaykum!",
    question: "Sizga qanday yordam kerak?",
    emergency: "Shoshilinch yordam kerakmi?",
    emergencyDescription: "Yordam chaqirish yoki yaqinlaringizga xabar berish uchun bosing.",
    sos: "SOS — YORDAM CHAQRISH",
    mainActions: "Nima qilmoqchisiz?",
    map: "Tibbiy muassasani topish",
    mapDesc: "Klinika, shifoxona yoki dorixonani toping.",
    medicine: "Dori eslatmalari",
    medicineDesc: "Dori va tibbiy qabullar jadvalini ko‘ring.",
    contacts: "Yaqinlarim bilan bog‘lanish",
    contactsDesc: "Ishonchli insonlar va yordam kontaktlari.",
    accessibility: "Qulaylik sozlamalari",
    largeText: "Katta matn",
    contrast: "Yuqori kontrast",
    speak: "Ovozli ko‘rsatma",
    footer: "CareMate — har bir inson uchun sodda va qulay yordam.",
    sosTitle: "Sizga qanday yordam kerak?",
    sosText: "Haqiqiy favqulodda holatda 103 raqamiga qo‘ng‘iroq qiling. Tugma telefon ilovasini ochadi; CareMate qo‘ng‘iroqni avtomatik amalga oshirmaydi.",
    call103: "103 ga qo‘ng‘iroq qilish",
    notify: "Yaqinimga test xabari",
    demo: "Demo rejimi: xabar yuborilmadi.",
    close: "Yopish",
    getLocation: "Joylashuvni aniqlash",
    locationHelp: "Joylashuv faqat ruxsatingiz bilan olinadi.",
    locationDenied: "Joylashuv olinmadi. GPS ruxsatini tekshiring yoki manzilni qo‘lda tanlang.",
    speechText: "CareMate. Sizga qanday yordam kerak? Tibbiy muassasa, dori eslatmalari yoki SOS yordamni tanlang.",
    voiceLoading: "Irina ovozi yuklanmoqda (taxminan 63 MB). Birinchi ishga tushirish biroz vaqt olishi mumkin.",
    voicePlaying: "CareMate ko‘rsatmasi Irina ovozi bilan aytilmoqda.",
    voiceComplete: "Ovozli ko‘rsatma tugadi.",
    voiceError: "Ovozni yuklab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.",
    voiceUzbekFallback: "Irina modeli rus tilida. O‘zbekcha matn brauzerning tizim ovozi bilan aytiladi.",
    voiceUnsupported: "Bu brauzerda ovozli ko‘rsatma qo‘llab-quvvatlanmaydi.",
    home: "Bosh sahifa",
  },
  ru: {
    lang: "Русский",
    welcome: "Здравствуйте!",
    question: "Чем мы можем вам помочь?",
    emergency: "Нужна срочная помощь?",
    emergencyDescription: "Нажмите, чтобы перейти к вызову помощи или оповещению близких.",
    sos: "SOS — ВЫЗВАТЬ ПОМОЩЬ",
    mainActions: "Что вы хотите сделать?",
    map: "Найти медицинское учреждение",
    mapDesc: "Найдите клинику, больницу или аптеку.",
    medicine: "Напоминания о лекарствах",
    medicineDesc: "Посмотрите расписание лекарств и приёмов.",
    contacts: "Связаться с близкими",
    contactsDesc: "Доверенные люди и контакты для помощи.",
    accessibility: "Настройки доступности",
    largeText: "Крупный текст",
    contrast: "Высокий контраст",
    speak: "Голосовая подсказка",
    footer: "CareMate — простая и доступная помощь для каждого.",
    sosTitle: "Какая помощь вам нужна?",
    sosText: "При настоящей чрезвычайной ситуации позвоните по номеру 103. Кнопка откроет приложение телефона; CareMate не совершает звонок автоматически.",
    call103: "Позвонить по номеру 103",
    notify: "Тестовое сообщение близкому",
    demo: "Демо-режим: сообщение не отправлено.",
    close: "Закрыть",
    getLocation: "Определить местоположение",
    locationHelp: "Местоположение определяется только с вашего разрешения.",
    locationDenied: "Местоположение не получено. Проверьте разрешение GPS или укажите адрес вручную.",
    speechText: "CareMate. Чем мы можем вам помочь? Выберите медицинское учреждение, напоминания о лекарствах или экстренную помощь.",
    voiceLoading: "Загружается голос Irina (около 63 МБ). При первом запуске это может занять некоторое время.",
    voicePlaying: "Подсказка CareMate произносится голосом Irina.",
    voiceComplete: "Голосовая подсказка завершена.",
    voiceError: "Не удалось загрузить голос. Проверьте подключение и повторите попытку.",
    voiceUzbekFallback: "Модель Irina говорит по-русски. Узбекский текст озвучивается системным голосом браузера.",
    voiceUnsupported: "Этот браузер не поддерживает голосовые подсказки.",
    home: "Главная",
  },
};

export default function HomePage() {
  const [language, setLanguage] = useState<Language>("uz");
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [voiceHints, setVoiceHints] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const voiceRequestRef = useRef(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const [demoNotice, setDemoNotice] = useState(false);
  const [locationText, setLocationText] = useState("");
  const t = copy[language];

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationText(t.locationDenied);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setLocationText(
        `${language === "uz" ? "Sizning joylashuvingiz" : "Ваше местоположение"}: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
      ),
      () => setLocationText(t.locationDenied),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  function stopCurrentSpeech() {
    voiceRequestRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (activeAudioRef.current) {
      activeAudioRef.current.onended = null;
      activeAudioRef.current.onerror = null;
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    setVoiceHints(false);
    setVoiceStatus("");
  }

  async function toggleSpeech() {
    if (voiceHints) {
      stopCurrentSpeech();
      return;
    }

    const requestId = ++voiceRequestRef.current;
    setVoiceHints(true);

    if (language === "uz") {
      if (!("speechSynthesis" in window)) {
        setVoiceHints(false);
        setVoiceStatus(t.voiceUnsupported);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(t.speechText);
      utterance.lang = "uz-UZ";
      const uzbekVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("uz"));
      if (uzbekVoice) utterance.voice = uzbekVoice;
      utterance.onend = () => {
        if (requestId === voiceRequestRef.current) {
          setVoiceHints(false);
          setVoiceStatus(t.voiceComplete);
        }
      };
      utterance.onerror = () => {
        if (requestId === voiceRequestRef.current) {
          setVoiceHints(false);
          setVoiceStatus(t.voiceUnsupported);
        }
      };
      setVoiceStatus(t.voiceUzbekFallback);
      window.speechSynthesis.speak(utterance);
      return;
    }

    setVoiceStatus(t.voiceLoading);
    let generatedObjectUrl: string | null = null;
    try {
      await ensurePiperRuntime();
      if (requestId !== voiceRequestRef.current) return;

      const browserWindow = window as PiperWindow;
      const piper = browserWindow.CareMatePiper;
      if (!piper) throw new Error("Piper engine is unavailable.");
      let enginePromise = browserWindow.__careMatePiperEngine;
      if (!enginePromise) {
        enginePromise = piper.createEngine(
          "/voices/ru_RU-irina-medium.onnx",
          "/voices/ru_RU-irina-medium.onnx.json",
        );
        browserWindow.__careMatePiperEngine = enginePromise;
      }

      let engine: PiperEngine;
      try {
        engine = await enginePromise;
      } catch (error) {
        if (browserWindow.__careMatePiperEngine === enginePromise) browserWindow.__careMatePiperEngine = undefined;
        throw error;
      }
      if (requestId !== voiceRequestRef.current) return;

      const pcm = await engine.speak(t.speechText, { lengthScale: 1.04 });
      if (requestId !== voiceRequestRef.current) return;
      const wav = piper.toWav(pcm, engine.sampleRate);
      const objectUrl = URL.createObjectURL(wav);
      generatedObjectUrl = objectUrl;
      activeObjectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      activeAudioRef.current = audio;
      audio.onended = () => {
        if (requestId === voiceRequestRef.current) {
          setVoiceHints(false);
          setVoiceStatus(t.voiceComplete);
        }
        URL.revokeObjectURL(objectUrl);
        generatedObjectUrl = null;
        if (activeObjectUrlRef.current === objectUrl) activeObjectUrlRef.current = null;
        if (activeAudioRef.current === audio) activeAudioRef.current = null;
      };
      audio.onerror = () => {
        if (requestId === voiceRequestRef.current) {
          setVoiceHints(false);
          setVoiceStatus(t.voiceError);
        }
        URL.revokeObjectURL(objectUrl);
        generatedObjectUrl = null;
        if (activeObjectUrlRef.current === objectUrl) activeObjectUrlRef.current = null;
        if (activeAudioRef.current === audio) activeAudioRef.current = null;
      };
      await audio.play();
      if (requestId === voiceRequestRef.current) setVoiceStatus(t.voicePlaying);
    } catch (error) {
      if (generatedObjectUrl) {
        URL.revokeObjectURL(generatedObjectUrl);
        generatedObjectUrl = null;
      }
      if (requestId === voiceRequestRef.current) {
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
          activeAudioRef.current = null;
        }
        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
          activeObjectUrlRef.current = null;
        }
        console.error("CareMate Piper voice failed:", error);
        setVoiceHints(false);
        setVoiceStatus(t.voiceError);
      }
    }
  }

  return (
    <main className={`simple-app ${largeText ? "large-text" : ""} ${highContrast ? "high-contrast" : ""}`}>
      <header className="simple-header">
        <Link href="/" className="simple-brand" aria-label="CareMate — bosh sahifa">
          <span className="simple-brand-icon"><HeartPulse size={30} strokeWidth={2.5} /></span>
          <span><strong>CareMate</strong><small>SMART HEALTHCARE</small></span>
        </Link>
        <button
          className="language-switch"
          onClick={() => setLanguage(language === "uz" ? "ru" : "uz")}
          aria-label={language === "uz" ? "Переключить на русский" : "O‘zbek tiliga o‘tish"}
        >
          <Languages size={22} />
          <span>{language === "uz" ? "РУССКИЙ" : "O‘ZBEKCHA"}</span>
        </button>
      </header>

      <div className="simple-content">
        <section className="welcome-simple" aria-labelledby="welcome-title">
          <div className="welcome-icon"><Accessibility size={34} /></div>
          <p className="welcome-kicker">CareMate</p>
          <h1 id="welcome-title">{t.welcome}</h1>
          <p>{t.question}</p>
        </section>

        <section className="emergency-simple" aria-labelledby="emergency-title">
          <div className="emergency-copy">
            <span className="emergency-symbol"><Siren size={32} /></span>
            <div>
              <h2 id="emergency-title">{t.emergency}</h2>
              <p>{t.emergencyDescription}</p>
            </div>
          </div>
          <button className="sos-primary" onClick={() => { setIsSosOpen(true); setDemoNotice(false); }}>
            <PhoneCall size={28} strokeWidth={2.5} />
            <span>{t.sos}</span>
            <ArrowRight size={25} />
          </button>
        </section>

        <section className="main-actions-simple" aria-labelledby="main-actions-title">
          <h2 id="main-actions-title">{t.mainActions}</h2>
          <nav className="big-actions" aria-label={t.mainActions}>
            <Link href="/map" className="big-action action-map">
              <span className="big-action-icon"><MapPin size={34} strokeWidth={2.3} /></span>
              <span className="big-action-copy"><strong>{t.map}</strong><small>{t.mapDesc}</small></span>
              <ArrowRight className="big-action-arrow" size={27} />
            </Link>
            <Link href="/routine" className="big-action action-medicine">
              <span className="big-action-icon"><Pill size={34} strokeWidth={2.3} /></span>
              <span className="big-action-copy"><strong>{t.medicine}</strong><small>{t.medicineDesc}</small></span>
              <ArrowRight className="big-action-arrow" size={27} />
            </Link>
            <Link href="/profile" className="big-action action-contacts">
              <span className="big-action-icon"><UsersRound size={34} strokeWidth={2.3} /></span>
              <span className="big-action-copy"><strong>{t.contacts}</strong><small>{t.contactsDesc}</small></span>
              <ArrowRight className="big-action-arrow" size={27} />
            </Link>
          </nav>
        </section>

        <section className="accessibility-simple" aria-labelledby="accessibility-title">
          <div className="accessibility-title-row">
            <Accessibility size={28} />
            <h2 id="accessibility-title">{t.accessibility}</h2>
          </div>
          <div className="accessibility-controls">
            <button className={`accessibility-control ${largeText ? "enabled" : ""}`} onClick={() => setLargeText(!largeText)} aria-pressed={largeText}>
              <Type size={27} />
              <span>{t.largeText}</span>
              {largeText && <Check className="control-check" size={23} />}
            </button>
            <button className={`accessibility-control ${highContrast ? "enabled" : ""}`} onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast}>
              <span className="contrast-icon">◐</span>
              <span>{t.contrast}</span>
              {highContrast && <Check className="control-check" size={23} />}
            </button>
            <button className={`accessibility-control ${voiceHints ? "enabled" : ""}`} onClick={toggleSpeech} aria-pressed={voiceHints}>
              <Volume2 size={25} />
              <span>{t.speak}</span>
              {voiceHints && <Check className="control-check" size={23} />}
            </button>
          </div>
          {voiceStatus && <p className="voice-status" role="status" aria-live="polite">{voiceStatus}</p>}
        </section>

        <footer className="simple-footer">
          <HeartPulse size={20} />
          <span>{t.footer}</span>
        </footer>
      </div>

      {locationText && <div className="simple-location-message" role="status">{locationText}</div>}

      {isSosOpen && (
        <div className="simple-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSosOpen(false); }}>
          <section className="simple-sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-modal-title">
            <button className="simple-modal-close" aria-label={t.close} onClick={() => setIsSosOpen(false)}><X size={28} /></button>
            <div className="simple-modal-icon"><Siren size={38} /></div>
            <h2 id="sos-modal-title">{t.sosTitle}</h2>
            <p className="simple-modal-description">{t.sosText}</p>
            <a href="tel:103" className="simple-call-button"><PhoneCall size={28} /><span>{t.call103}</span><ArrowRight size={25} /></a>
            <button className="simple-contact-button" onClick={() => { setDemoNotice(true); locateUser(); }}>
              <MessageCircle size={26} /><span>{t.notify}</span>
            </button>
            {demoNotice && <div className="simple-demo-alert" role="status"><Check size={23} />{t.demo}</div>}
            <button className="simple-location-button" onClick={locateUser}><MapPin size={24} /><span>{t.getLocation}</span></button>
            <p className="simple-location-help">{t.locationHelp}</p>
            <button className="simple-close-button" onClick={() => setIsSosOpen(false)}>{t.close}</button>
          </section>
        </div>
      )}
    </main>
  );
}
