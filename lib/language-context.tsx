import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LANGUAGES, translate, type Language, type StringKey } from "./i18n";

const STORAGE_KEY = "nata.language";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: PropsWithChildren) {
  // profiles.language defaults to 'az' in the database, and the shipped app
  // opens in Azerbaijani — so that's the startup locale here too.
  const [lang, setLangState] = useState<Language>("az");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && (LANGUAGES as readonly string[]).includes(stored)) {
        setLangState(stored as Language);
      }
    });
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}
