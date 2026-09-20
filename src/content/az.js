// Azerbaijani is the source of truth, exactly as it is in the app.
//
// The landing copy here is recovered verbatim from the deployed site — the
// source was lost, so the live HTML was the only specification that existed.
// Where something was plainly wrong it is marked with a NOTE rather than
// quietly changed: the brand was written "Laundary" throughout and the privacy
// contact pointed at laundary.com, a domain this business does not own.
export default {
  meta: {
    locale: "az",
    label: "Azərbaycan",
    short: "AZ",
  },

  nav: {
    services: "Xidmətlər",
    efficiency: "Səmərəlilik",
    about: "Haqqımızda",
    faq: "Çox verilən suallar",
    download: "Tətbiqi yüklə",
  },

  hero: {
    rating: "10,000+ məmnun müştəri tərəfindən 4.9/5 qiymətləndirilib",
    title: "Premium Geyim Baxımı, Yenidən Təyin Edildi.",
    lead: "Ən yüksək rahatlığı yaşayın. Biz qarderobunuzu qapınızdan götürür, ustalıqla təmizləyir və qüsursuz vəziyyətdə geri qaytarırıq.",
    primary: "Tətbiqi yüklə",
    secondary: "Necə işləyir?",
    statCycle: "Dövr",
    statCycleValue: "24 saat",
    statCleaned: "Təmizlənmiş əşyalar",
    statCleanedValue: "1M+",
    cardStatus: "Götürmə təsdiqləndi",
    cardTime: "Bu gün, 14:00",
  },

  services: {
    eyebrow: "Xidmət icmalı",
    title: "Xidmətlər",
    items: [
      { name: "Yuma", body: "Gündəlik paltarların yuyulması və qatlanması." },
      { name: "Quru Təmizləmə", body: "Zərif parçalar və paltarlar üçün." },
      { name: "Ütüləmə", body: "Artıq təmiz olan əşyalar üçün." },
      { name: "Yorğan və Böyük Əşyalar", body: "Xüsusi qayğı tələb edən böyük əşyalar." },
    ],
  },

  efficiency: {
    title: "Daha Ağıllı Təmizləmə, Bənzərsiz Sürət",
    lead: "Nata Laundry qüsursuz, ultra-sürətli quru təmizləmə təcrübəsi təqdim etmək üçün qabaqcıl parça texnologiyası və süni intellekt logistikasından istifadə edir.",
    items: [
      {
        name: "Ağıllı Marşrut",
        body: "Xüsusi süni intellekt logistika sistemimiz karbon izini azaldaraq ildırım sürəti ilə götürülməni təmin edir.",
      },
      {
        name: "Ekoloji cəhətdən Təmiz",
        body: "Paltarlarınızı qoruyan 100% ekoloji cəhətdən təmiz, premium həlledicilərlə davamlılığa sadiqik.",
      },
      {
        name: "Keyfiyyət Zəmanəti",
        body: "Razı qalmasanız, pulsuz olaraq yenidən təmizləyəcəyik.",
      },
      {
        name: "Ekspert Baxımı",
        body: "Hər bir sapa güzəştsiz diqqətlə yanaşan usta təmizləyicilərdən ibarət xüsusi komanda.",
      },
    ],
    waterLabel: "Qənaət edilən Su",
    waterValue: "12,450 L",
    waterNote: "Bu ay məhəllənizdə",
    orderLabel: "Sifariş #892",
    orderReady: "Hazırdır",
    orderDelivering: "Çatdırılır",
    orderEta: "15 dəqiqəyə çatır",
    chips: ["Premium Baxım", "Sürətli Çatdırılma", "Ekoloji cəhətdən Təmiz"],
    yearsValue: "5+",
    yearsLabel: "Camaşırxanada inqilab etdiyimiz illər.",
  },

  about: {
    title: "Haqqımızda",
    body1:
      "Nata Laundry, premium keyfiyyəti misilsiz rahatlıqla birləşdirərək geyim baxımını yenidən müəyyən etmək məqsədi ilə Bakıda yaradılmışdır. Qarderobunuzun sizin üçün dəyərli olduğunu bilirik və ona layiq olduğu diqqətlə yanaşırıq.",
    body2:
      "Qabaqcıl parça texnologiyası, ekoloji cəhətdən təmiz vasitələr və süni intellektə əsaslanan logistikanı birləşdirərək quru təmizləməni yorucu bir işdən lüks və zəhmətsiz bir xidmətə çevirdik. Detalları bizə həvalə edin, siz isə sadəcə həyatın dadını çıxarın.",
    missionLabel: "Missiyamız",
    mission:
      "Geyim baxımını qüsursuz, lüks bir təcrübəyə çevirmək və sizin üçün həqiqətən önəmli olan şeylərə daha çox vaxt qazandırmaq.",
    visionLabel: "Baxışımız",
    vision:
      "Qüsursuz üslubun zəhmətsiz, davamlı və hər kəs üçün əlçatan olduğu bir gələcək.",
  },

  faq: {
    title: "Çox verilən suallar",
    help: "Kömək al",
    items: [
      {
        q: "Kreditlər nədir və necə işləyir?",
        a: "Kreditlər pul kisənizdəki rəqəmsal balansdır. 1 kredit 1 ₼-yə bərabərdir. Sifariş verərkən avtomatik tətbiq olunur.",
      },
      {
        q: "Kreditlərdən digər ödəniş üsulları ilə birlikdə istifadə edə bilərəmmi?",
        a: "Bəli. Kredit balansınız sifarişin məbləğindən az olduqda qalan hissəni seçdiyiniz digər ödəniş üsulu ilə ödəyə bilərsiniz.",
      },
      {
        q: "Kreditlərin vaxtı bitəcəkmi?",
        a: "Xeyr. Hesabınıza yazılan kreditlərin istifadə müddəti yoxdur və hesabınız aktiv olduğu müddətcə qalır.",
      },
      {
        q: "Kreditlərdən bütün xidmətlər üçün istifadə edə bilərəmmi?",
        a: "Bəli. Kreditlər yuma, quru təmizləmə, ütüləmə, yorğan və böyük əşyalar daxil olmaqla bütün xidmətlərə şamil olunur.",
      },
    ],
  },

  contact: {
    title: "Bizimlə əlaqə",
    lead: "Sualınız var? Komandamız kömək etməyə hazırdır.",
    phone: "Telefon",
    email: "E-poçt",
    whatsapp: "WhatsApp",
    address: "Ünvan",
    addressValue: "Bakı, Azərbaycan",
  },

  footer: {
    tagline:
      "Ən yüksək rahatlığı yaşayın. Biz qarderobunuzu qapınızdan götürür, ustalıqla təmizləyir və qüsursuz vəziyyətdə geri qaytarırıq.",
    servicesTitle: "Xidmətlər",
    helpTitle: "Hesab və kömək",
    legalTitle: "Hüquqi",
    rights: "Bütün hüquqlar qorunur.",
    terms: "İstifadə Şərtləri",
    privacy: "Məxfilik Siyasəti",
    note: "Bu sayt məlumat xarakterlidir. Sifariş yalnız mobil tətbiq vasitəsilə verilir.",
  },

  legal: {
    updated: "Son yenilənmə: 28 İyun, 2026",
    back: "Ana səhifə",
  },

  terms: {
    title: "İstifadə Şərtləri",
    sections: [
      {
        h: "1. Şərtlərin Qəbulu",
        p: [
          'Nata Laundry mobil tətbiqi və veb-saytına ("Platforma") daxil olmaq və istifadə etməklə siz bu razılaşmanın şərtlərini qəbul edirsiniz. Əgər yuxarıda göstərilənlərə riayət etməklə razı deyilsinizsə, lütfən bu xidmətdən istifadə etməyin.',
        ],
      },
      {
        h: "2. Xidmətin Təsviri",
        p: [
          "Nata Laundry camaşırxana, quru təmizləmə və əlaqədar əşyaların götürülməsi, təmizlənməsi və çatdırılmasını təmin edir. Biz ekspert tərəfdaşlarımızdan və ekoloji təmiz məhsullardan istifadə edərək ən yüksək keyfiyyətli xidmət təqdim etməyə çalışırıq.",
          "Bununla belə, biz bütün ləkələrin çıxarılmasına zəmanət verə və ya normal yuma zamanı cırıla və ya parçalana bilən zəif materiallara zərər dəyməyəcəyinə təminat verə bilmirik.",
        ],
      },
      {
        h: "3. İstifadəçi Öhdəlikləri",
        list: [
          "Paltar çantalarınızda heç bir təhlükəli və ya qadağan olunmuş əşyaların olmadığından əmin olun.",
          "Sürücülərimiz üçün dəqiq və təhlükəsiz götürülmə və çatdırılma təlimatlarını təmin edin.",
          "Geyimləri təhvil verməzdən əvvəl bütün cibləri boşaldın. Nata Laundry ciblərdə qalan və itirilən əşyalara görə məsuliyyət daşımır.",
          "Təmizləməyə göndərilən əşyaların tələb olunan prosesə (məsələn, standart yuma və ya yalnız quru təmizləmə) uyğun olduğundan əmin olun.",
        ],
      },
      {
        h: "4. Ödəniş və Hesablaşma",
        p: [
          "Ödənişlər təmizləmə dövrü başa çatdıqda, çatdırılmadan əvvəl avtomatik olaraq işlənir. Platformamızda ödəniş üsulunu təqdim etməklə, müvafiq ödənişləri çıxmağımıza icazə verirsiniz. Abunə haqları aylıq tutulur və ləğv edilmədikcə avtomatik yenilənir.",
        ],
      },
      {
        h: "5. Məsuliyyət Siyasəti",
        p: [
          "Nadir hallarda baş verə biləcək itki və ya zədələnmə zamanı Nata Laundry-nin məsuliyyəti markasından, orijinal dəyərindən və ya vəziyyətindən asılı olmayaraq, müvafiq əşyanın təmizlənməsi üçün alınan məbləğin 10 misli ilə məhdudlaşır. Mövcud zədələrə, normal aşınmaya və ya müvafiq qulluq etiketləri olmayan əşyalara görə məsuliyyət daşımırıq.",
        ],
      },
    ],
  },

  privacy: {
    title: "Məxfilik Siyasəti",
    sections: [
      {
        h: "1. Topladığımız Məlumatlar",
        p: [
          "Hesab qeydiyyatdan keçirərkən, xidmət təyin edərkən və ya dəstək komandamızla əlaqə saxlayarkən birbaşa bizə təqdim etdiyiniz məlumatları toplayırıq. Buraya daxildir:",
        ],
        list: [
          "Şəxsi məlumatlar: Ad, e-poçt ünvanı, telefon nömrəsi.",
          "Məkan məlumatları: Götürülmə və çatdırılma üçün fiziki ünvan.",
          "Maliyyə məlumatları: Ödəniş məlumatları təhlükəsiz şəkildə işlənir.",
        ],
      },
      {
        h: "2. Məlumatlarınızdan Necə İstifadə Edirik",
        p: [
          "Topladığımız məlumatlar xidmətin fəaliyyəti və təcrübənizin yaxşılaşdırılması üçün zəruridir. Biz onu bu məqsədlərlə istifadə edirik:",
        ],
        list: [
          "Sürücü marşrutizasiyası da daxil olmaqla xidmətlərimizi təqdim etmək, saxlamaq və optimallaşdırmaq.",
          "Tranzaksiyaları işləmək və sifarişlə bağlı məlumatları göndərmək.",
          "Sizə texniki bildirişlər, tətbiq yeniləmələri, təhlükəsizlik xəbərdarlıqları və dəstək mesajları göndərmək.",
          "Aksiyalar və mükafatlar barədə məlumat vermək.",
        ],
      },
      {
        h: "3. Məlumat Təhlükəsizliyi",
        p: [
          "Şəxsi məlumatlarınızı itkidən, oğurluqdan, sui-istifadədən, icazəsiz girişdən, ifşadan, dəyişdirilmədən və məhv edilmədən qorumaq üçün ciddi tədbirlər görürük. Ödəniş emal infrastrukturumuz şifrələnmişdir və PCI standartlarına uyğundur.",
        ],
      },
      {
        h: "4. Məlumatların Paylaşılması",
        p: [
          "Biz sizin şəxsi məlumatlarınızı satmırıq. Məlumatları yalnız adımızdan iş görmək üçün çıxışı zəruri olan, ciddi yoxlanılmış üçüncü tərəf təchizatçıları, məsləhətçiləri və xidmət təminatçıları ilə paylaşa bilərik. Məsələn, çatdırılma sürücüləri sifarişinizi tamamlamaq üçün tələb olunan məhdud marşrut və əlaqə məlumatlarını alırlar.",
        ],
      },
      {
        // Added, not recovered. Google Play requires a route to account
        // deletion that is reachable without installing the app, and the two
        // lists below have to match what delete_my_account() actually does.
        h: "5. Hesabın Silinməsi",
        anchor: "hesabin-silinmesi",
        p: [
          "Hesabınızı istənilən vaxt silə bilərsiniz. Tətbiqdə: Profil → Kömək və dəstək bölməsinin altındakı «Hesabı sil» düyməsi. Tətbiq olmadan silmək üçün aşağıdakı ünvana yazın; sorğunuzu şəxsiyyətinizi təsdiqlədikdən sonra 30 gün ərzində icra edirik.",
        ],
        list: [
          "Silinir: adınız, telefon nömrəniz, e-poçt ünvanınız, ünvanlarınız, sifariş qeydləriniz, bildirişləriniz və giriş məlumatlarınız (parol və Google bağlantısı).",
          "Saxlanılır: mühasibat uçotu üçün sifarişlərin məbləği və tarixi. Bu qeydlər artıq sizin adınızla bağlı deyil və sizi tanımaq üçün istifadə edilə bilməz.",
        ],
        contactLine: "Silmə sorğusu üçün:",
      },
      {
        h: "6. Bizimlə Əlaqə",
        p: [
          "Əgər bu Məxfilik Siyasəti və ya şəxsi məlumatlarınızla bağlı hər hansı sualınız və ya narahatlığınız varsa, lütfən bizimlə əlaqə saxlayın:",
        ],
      },
    ],
  },
};
