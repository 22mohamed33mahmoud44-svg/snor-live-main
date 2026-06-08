import {
  Video, Radio, Gift, Sparkles, Shield, Smartphone,
  CreditCard, Send, Wallet, Crown, Trophy,
} from 'lucide-react';

export const translations = {
  ar: {
    lang: 'EN',
    nav: {
      home: 'الرئيسية', features: 'المميزات', gems: 'الجواهر',
      pricing: 'الأسعار', download: 'التحميل', login: 'دخول', signup: 'حساب جديد',
    },
    hero: {
      headlineAr: 'بث مباشر. شات فيديو. بلا حدود.',
      headlineEn: 'Live Stream. Video Chat. No Limits.',
      cta: 'ابدأ مجاناً', viewers: 'مشاهد', live: 'مباشر',
    },
    stats: { users: 'مستخدم', countries: 'دولة', verified: 'موثق', live: 'على الهواء' },
    features: {
      title: 'المميزات', titleEn: 'Features',
      items: [
        { icon: Video,      titleAr: 'فيديو شات عشوائي', titleEn: 'Random Video Chat', descAr: 'تواصل مع أشخاص جدد من جميع أنحاء العالم', descEn: 'Connect with new people worldwide' },
        { icon: Radio,      titleAr: 'بث مباشر',         titleEn: 'Live Streaming',    descAr: 'شارك لحظاتك مباشرة مع جمهورك',            descEn: 'Share your moments live' },
        { icon: Gift,       titleAr: 'هدايا بالجواهر',   titleEn: 'Gem Gifts',         descAr: 'أرسل وأستقبل هدايا افتراضية',             descEn: 'Send and receive virtual gifts' },
        { icon: Sparkles,   titleAr: 'فلاتر وتأثيرات',  titleEn: 'Filters & Effects', descAr: 'فلاتر وتأثيرات مميزة',                    descEn: 'Amazing filters and effects' },
        { icon: Shield,     titleAr: 'أمان وخصوصية',    titleEn: 'Safety & Privacy',  descAr: 'حماية كاملة لبياناتك',                    descEn: 'Complete data protection' },
        { icon: Smartphone, titleAr: 'متعدد المنصات',   titleEn: 'Cross-Platform',    descAr: 'متوفر على جميع الأجهزة',                  descEn: 'Available on all devices' },
      ],
    },
    gems: {
      title: 'نظام الجواهر', titleEn: 'The Gems System',
      steps: [
        { icon: CreditCard, titleAr: 'اشتري جواهر', titleEn: 'Buy Gems',      descAr: 'اشحن جواهر بفلوس حقيقية', descEn: 'Top-up with real money' },
        { icon: Send,       titleAr: 'ابعت هدايا',  titleEn: 'Send Gifts',    descAr: 'أرسل هدايا للمبدعين',    descEn: 'Send gifts to creators' },
        { icon: Wallet,     titleAr: 'المبدع يكسب', titleEn: 'Creator Earns', descAr: 'حوّل الجواهر لكاش',       descEn: 'Convert gems to cash' },
      ],
      packages: [
        { gems: 100,  price: 10,  popular: false },
        { gems: 500,  price: 45,  popular: false },
        { gems: 1200, price: 99,  popular: true  },
        { gems: 3000, price: 229, popular: false },
      ],
      gemsText: 'جوهرة', currency: 'جنيه', mostValue: 'الأوفر',
      conversionAr: '1,000 جوهرة = 50 جنيه للمبدع', conversionEn: '1,000 Gems = 50 EGP',
    },
    monetization: {
      title: 'اكسب من Snor Live', titleEn: 'Earn with Snor Live',
      items: [
        { icon: Gift,   titleAr: 'هدايا الجواهر',   titleEn: 'Gem Gifts',         descAr: 'استقبل هدايا وحولها لكاش', descEn: 'Receive gifts and cash out' },
        { icon: Crown,  titleAr: 'اشتراكات VIP',    titleEn: 'VIP Subscriptions', descAr: 'محتوى حصري للمميزين',      descEn: 'Exclusive VIP content' },
        { icon: Trophy, titleAr: 'برنامج المبدعين', titleEn: 'Creator Program',   descAr: 'عمولة شهرية بالمشاهدات',   descEn: 'Monthly commission' },
      ],
    },
    howItWorks: {
      title: 'كيف يعمل', titleEn: 'How It Works',
      steps: [
        { ar: 'سجّل حسابك',          en: 'Create Account'         },
        { ar: 'اختر: شات أو بث',     en: 'Choose: Chat or Stream' },
        { ar: 'ابدأ واكسب بالجواهر', en: 'Go Live & Earn Gems'    },
      ],
    },
    testimonials: {
      title: 'آراء المستخدمين', titleEn: 'Testimonials',
      items: [
        { name: 'سارة أحمد', role: 'مبدعة محتوى', roleEn: 'Content Creator', text: 'منصة رائعة! كسبت آلاف الجواهر من البث المباشر.', textEn: 'Amazing platform! Earned thousands of gems.', rating: 5 },
        { name: 'محمد علي',  role: 'بث مباشر',    roleEn: 'Live Streamer',   text: 'أفضل تجربة شات فيديو! نظام الجواهر عادل جداً.',  textEn: 'Best video chat experience!', rating: 5 },
        { name: 'نورا خالد', role: 'مشاهدة',      roleEn: 'Viewer',          text: 'أستمتع بمشاهدة البث كل يوم. هدايا الجواهر ممتعة.', textEn: 'I enjoy watching streams daily.', rating: 4 },
      ],
    },
    pricing: {
      title: 'خطط الأسعار', titleEn: 'Pricing Plans',
      free: { title: 'مجاني', titleEn: 'Free', price: '0',  period: '',          features: ['شات فيديو', 'مشاهدة البث', '50 جوهرة ترحيبية'],                         featuresEn: ['Video Chat', 'Watch Streams', '50 Welcome Gems'] },
      pro:  { title: 'برو',   titleEn: 'Pro',  price: '49', period: 'جنيه/شهر', periodEn: 'EGP/month', features: ['كل مميزات المجاني', 'بث مباشر', '100 جوهرة مجاناً', 'شارات مميزة'], featuresEn: ['All Free features', 'Live Streaming', '100 Free Gems', 'Special Badges'], popular: true },
      vip:  { title: 'VIP',   titleEn: 'VIP',  price: '99', period: 'جنيه/شهر', periodEn: 'EGP/month', features: ['كل مميزات برو', '300 جوهرة مجاناً', 'فلاتر حصرية', 'دعم أولوية'],  featuresEn: ['All Pro features', '300 Free Gems', 'Exclusive Filters', 'Priority Support'] },
      popular: 'الأكثر شعبية', popularEn: 'Most Popular',
      selectPlan: 'اختر الخطة', selectPlanEn: 'Select Plan',
    },
    download: {
      title: 'حمّل التطبيق', titleEn: 'Download the App',
      subtitle: 'متوفر على جميع المنصات', subtitleEn: 'Available on all platforms',
      appStore: 'App Store', playStore: 'Google Play',
      installBtn: '📲 ثبّت التطبيق', installedMsg: '✅ تم التثبيت!', notSupported: '⬇️ تحميل',
    },
    footer: {
      rights: 'جميع الحقوق محفوظة', rightsEn: 'All rights reserved',
      sections: {
        product: { ar: 'المنتج',  en: 'Product' },
        company: { ar: 'الشركة', en: 'Company' },
        support: { ar: 'الدعم',  en: 'Support'  },
      },
    },
  },

  en: {
    lang: 'AR',
    nav: {
      home: 'Home', features: 'Features', gems: 'Gems',
      pricing: 'Pricing', download: 'Download', login: 'Login', signup: 'Sign Up',
    },
    hero: {
      headlineAr: 'بث مباشر. شات فيديو. بلا حدود.',
      headlineEn: 'Live Stream. Video Chat. No Limits.',
      cta: 'Start Free', viewers: 'Viewers', live: 'LIVE',
    },
    stats: { users: 'Users', countries: 'Countries', verified: 'Verified', live: 'Live 24/7' },
    features: {
      title: 'المميزات', titleEn: 'Features',
      items: [
        { icon: Video,      titleAr: 'فيديو شات عشوائي', titleEn: 'Random Video Chat', descAr: 'تواصل مع أشخاص جدد', descEn: 'Connect with new people worldwide' },
        { icon: Radio,      titleAr: 'بث مباشر',         titleEn: 'Live Streaming',    descAr: 'شارك لحظاتك مباشرة', descEn: 'Share your moments live' },
        { icon: Gift,       titleAr: 'هدايا بالجواهر',   titleEn: 'Gem Gifts',         descAr: 'أرسل وأستقبل هدايا', descEn: 'Send and receive virtual gifts' },
        { icon: Sparkles,   titleAr: 'فلاتر وتأثيرات',  titleEn: 'Filters & Effects', descAr: 'فلاتر مميزة',        descEn: 'Amazing filters and effects' },
        { icon: Shield,     titleAr: 'أمان وخصوصية',    titleEn: 'Safety & Privacy',  descAr: 'حماية كاملة',       descEn: 'Complete data protection' },
        { icon: Smartphone, titleAr: 'متعدد المنصات',   titleEn: 'Cross-Platform',    descAr: 'متوفر على الأجهزة', descEn: 'Available on all devices' },
      ],
    },
    gems: {
      title: 'نظام الجواهر', titleEn: 'The Gems System',
      steps: [
        { icon: CreditCard, titleAr: 'اشتري جواهر', titleEn: 'Buy Gems',      descAr: 'اشحن بفلوس حقيقية', descEn: 'Top-up with real money' },
        { icon: Send,       titleAr: 'ابعت هدايا',  titleEn: 'Send Gifts',    descAr: 'أرسل للمبدعين',    descEn: 'Send gifts to creators' },
        { icon: Wallet,     titleAr: 'المبدع يكسب', titleEn: 'Creator Earns', descAr: 'حوّل لكاش',        descEn: 'Convert gems to cash' },
      ],
      packages: [
        { gems: 100,  price: 10,  popular: false },
        { gems: 500,  price: 45,  popular: false },
        { gems: 1200, price: 99,  popular: true  },
        { gems: 3000, price: 229, popular: false },
      ],
      gemsText: 'Gems', currency: 'EGP', mostValue: 'Best Value',
      conversionAr: '1,000 جوهرة = 50 جنيه للمبدع', conversionEn: '1,000 Gems = 50 EGP',
    },
    monetization: {
      title: 'اكسب من Snor Live', titleEn: 'Earn with Snor Live',
      items: [
        { icon: Gift,   titleAr: 'هدايا الجواهر',   titleEn: 'Gem Gifts',         descAr: 'استقبل هدايا وحولها لكاش', descEn: 'Receive gifts and cash out' },
        { icon: Crown,  titleAr: 'اشتراكات VIP',    titleEn: 'VIP Subscriptions', descAr: 'محتوى حصري',               descEn: 'Exclusive VIP content' },
        { icon: Trophy, titleAr: 'برنامج المبدعين', titleEn: 'Creator Program',   descAr: 'عمولة شهرية',              descEn: 'Monthly commission' },
      ],
    },
    howItWorks: {
      title: 'كيف يعمل', titleEn: 'How It Works',
      steps: [
        { ar: 'سجّل حسابك',          en: 'Create Account'         },
        { ar: 'اختر: شات أو بث',     en: 'Choose: Chat or Stream' },
        { ar: 'ابدأ واكسب بالجواهر', en: 'Go Live & Earn Gems'    },
      ],
    },
    testimonials: {
      title: 'آراء المستخدمين', titleEn: 'Testimonials',
      items: [
        { name: 'Sara Ahmed',   role: 'مبدعة محتوى', roleEn: 'Content Creator', text: 'منصة رائعة!', textEn: 'Amazing platform! Earned thousands of gems.', rating: 5 },
        { name: 'Mohamed Ali',  role: 'بث مباشر',    roleEn: 'Live Streamer',   text: 'أفضل تجربة!', textEn: 'Best video chat experience!',                rating: 5 },
        { name: 'Noura Khaled', role: 'مشاهدة',      roleEn: 'Viewer',          text: 'رائع جداً!',  textEn: 'I enjoy watching streams daily.',            rating: 4 },
      ],
    },
    pricing: {
      title: 'خطط الأسعار', titleEn: 'Pricing Plans',
      free: { title: 'مجاني', titleEn: 'Free', price: '0',  period: '',          features: ['شات فيديو', 'مشاهدة البث', '50 جوهرة ترحيبية'],                         featuresEn: ['Video Chat', 'Watch Streams', '50 Welcome Gems'] },
      pro:  { title: 'برو',   titleEn: 'Pro',  price: '49', period: 'جنيه/شهر', periodEn: 'EGP/month', features: ['كل مميزات المجاني', 'بث مباشر', '100 جوهرة مجاناً', 'شارات مميزة'], featuresEn: ['All Free features', 'Live Streaming', '100 Free Gems', 'Special Badges'], popular: true },
      vip:  { title: 'VIP',   titleEn: 'VIP',  price: '99', period: 'جنيه/شهر', periodEn: 'EGP/month', features: ['كل مميزات برو', '300 جوهرة مجاناً', 'فلاتر حصرية', 'دعم أولوية'],  featuresEn: ['All Pro features', '300 Free Gems', 'Exclusive Filters', 'Priority Support'] },
      popular: 'الأكثر شعبية', popularEn: 'Most Popular',
      selectPlan: 'اختر الخطة', selectPlanEn: 'Select Plan',
    },
    download: {
      title: 'حمّل التطبيق', titleEn: 'Download the App',
      subtitle: 'متوفر على جميع المنصات', subtitleEn: 'Available on all platforms',
      appStore: 'App Store', playStore: 'Google Play',
      installBtn: '📲 Install App', installedMsg: '✅ Installed!', notSupported: '⬇️ Download',
    },
    footer: {
      rights: 'جميع الحقوق محفوظة', rightsEn: 'All rights reserved',
      sections: {
        product: { ar: 'المنتج',  en: 'Product' },
        company: { ar: 'الشركة', en: 'Company' },
        support: { ar: 'الدعم',  en: 'Support'  },
      },
    },
  },
} as const;

export type Lang = keyof typeof translations;
export type T    = typeof translations.ar;