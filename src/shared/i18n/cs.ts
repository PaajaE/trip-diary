import type { TranslationResources } from '@/shared/i18n/en'

export const cs: TranslationResources = {
  brand: 'Trip Diary',
  home: {
    eyebrow: 'Vaše cesty, uchované s lehkostí',
    title: 'Klidné místo pro každou cestu.',
    description:
      'Zachyťte fotky a příběhy během pár sekund. Do cest je uspořádáte, až budete chtít.',
    primaryAction: 'Přidat vzpomínku',
    secondaryAction: 'Prozkoumat cesty',
    signIn: 'Přihlásit se',
    status: 'Připraveno pro práci offline',
  },
  auth: {
    email: 'E-mail',
    username: 'Uživatelské jméno',
    password: 'Heslo',
    confirmPassword: 'Potvrzení hesla',
    genericError: 'Něco se nepovedlo. Zkontrolujte údaje a zkuste to znovu.',
    submitting: 'Chvilku strpení…',
    validation: {
      email: 'Zadejte platnou e-mailovou adresu.',
      password: 'Použijte 8–72 znaků.',
      passwordsDoNotMatch: 'Hesla se neshodují.',
      username: 'Použijte 3–30 malých písmen, číslic nebo podtržítek.',
    },
    signIn: {
      title: 'Vítejte zpět',
      description: 'Pokračujte tam, kde vaše cesta skončila.',
      action: 'Přihlásit se',
      alternative: 'Ještě nemáte Trip Diary?',
    },
    signUp: {
      title: 'Vytvořte si deník',
      description: 'Klidné místo pro všechna místa, na která budete vzpomínat.',
      action: 'Vytvořit účet',
      alternative: 'Už máte účet?',
    },
  },
  profile: {
    loading: 'Načítání profilu…',
    error: 'Profil se nepodařilo načíst.',
    notFound: 'Tento profil neexistuje.',
  },
  entry: {
    body: 'Příběh',
    createTitle: 'Přidat vzpomínku',
    error: 'Vzpomínku se nepodařilo načíst.',
    loading: 'Načítání…',
    notFound: 'Tato vzpomínka neexistuje.',
    photos: 'Fotografie',
    photosSelected: 'Vybráno fotografií: {{count}}',
    publish: 'Uložit a publikovat',
    signInRequired: 'Před publikováním vzpomínky se přihlaste.',
    syncNow: 'Synchronizovat nyní',
    title: 'Název',
    type: {
      note: 'Poznámka',
      place: 'Místo',
      story: 'Příběh',
      tip: 'Tip',
    },
    sync: {
      failed: 'Uloženo v zařízení · synchronizace vyžaduje pozornost',
      local: 'Uloženo v zařízení',
      pending: 'Uloženo v zařízení · čeká na synchronizaci',
      synced: 'Synchronizováno',
      syncing: 'Synchronizuje se…',
    },
  },
}
