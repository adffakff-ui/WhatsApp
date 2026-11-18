export interface AuthCountry {
  iso: string;
  nameAr: string;
  nameEn: string;
  dialCode: string;
  flag: string;
  placeholder: string;
  minDigits: number;
  maxDigits: number;
}

export const AUTH_COUNTRIES: AuthCountry[] = [
  {
    iso: 'SA',
    nameAr: 'المملكة العربية السعودية',
    nameEn: 'Saudi Arabia',
    dialCode: '+966',
    flag: '🇸🇦',
    placeholder: '50 123 4567',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'YE',
    nameAr: 'اليمن',
    nameEn: 'Yemen',
    dialCode: '+967',
    flag: '🇾🇪',
    placeholder: '770 123 456',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'AE',
    nameAr: 'الإمارات العربية المتحدة',
    nameEn: 'United Arab Emirates',
    dialCode: '+971',
    flag: '🇦🇪',
    placeholder: '50 123 4567',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'EG',
    nameAr: 'مصر',
    nameEn: 'Egypt',
    dialCode: '+20',
    flag: '🇪🇬',
    placeholder: '10 1234 5678',
    minDigits: 10,
    maxDigits: 10
  },
  {
    iso: 'JO',
    nameAr: 'الأردن',
    nameEn: 'Jordan',
    dialCode: '+962',
    flag: '🇯🇴',
    placeholder: '79 123 4567',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'KW',
    nameAr: 'الكويت',
    nameEn: 'Kuwait',
    dialCode: '+965',
    flag: '🇰🇼',
    placeholder: '500 12345',
    minDigits: 8,
    maxDigits: 8
  },
  {
    iso: 'QA',
    nameAr: 'قطر',
    nameEn: 'Qatar',
    dialCode: '+974',
    flag: '🇶🇦',
    placeholder: '3312 3456',
    minDigits: 8,
    maxDigits: 8
  },
  {
    iso: 'OM',
    nameAr: 'عُمان',
    nameEn: 'Oman',
    dialCode: '+968',
    flag: '🇴🇲',
    placeholder: '9123 4567',
    minDigits: 8,
    maxDigits: 8
  },
  {
    iso: 'BH',
    nameAr: 'البحرين',
    nameEn: 'Bahrain',
    dialCode: '+973',
    flag: '🇧🇭',
    placeholder: '3312 3456',
    minDigits: 8,
    maxDigits: 8
  },
  {
    iso: 'IQ',
    nameAr: 'العراق',
    nameEn: 'Iraq',
    dialCode: '+964',
    flag: '🇮🇶',
    placeholder: '770 123 4567',
    minDigits: 10,
    maxDigits: 10
  },
  {
    iso: 'SY',
    nameAr: 'سوريا',
    nameEn: 'Syria',
    dialCode: '+963',
    flag: '🇸🇾',
    placeholder: '944 123 456',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'LB',
    nameAr: 'لبنان',
    nameEn: 'Lebanon',
    dialCode: '+961',
    flag: '🇱🇧',
    placeholder: '71 123 456',
    minDigits: 7,
    maxDigits: 8
  },
  {
    iso: 'PS',
    nameAr: 'فلسطين',
    nameEn: 'Palestine',
    dialCode: '+970',
    flag: '🇵🇸',
    placeholder: '599 123 456',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'MA',
    nameAr: 'المغرب',
    nameEn: 'Morocco',
    dialCode: '+212',
    flag: '🇲🇦',
    placeholder: '612 345 678',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'DZ',
    nameAr: 'الجزائر',
    nameEn: 'Algeria',
    dialCode: '+213',
    flag: '🇩🇿',
    placeholder: '551 23 45 67',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'TN',
    nameAr: 'تونس',
    nameEn: 'Tunisia',
    dialCode: '+216',
    flag: '🇹🇳',
    placeholder: '20 123 456',
    minDigits: 8,
    maxDigits: 8
  },
  {
    iso: 'SD',
    nameAr: 'السودان',
    nameEn: 'Sudan',
    dialCode: '+249',
    flag: '🇸🇩',
    placeholder: '91 123 4567',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'LY',
    nameAr: 'ليبيا',
    nameEn: 'Libya',
    dialCode: '+218',
    flag: '🇱🇾',
    placeholder: '91 123 4567',
    minDigits: 9,
    maxDigits: 9
  },
  {
    iso: 'TR',
    nameAr: 'تركيا',
    nameEn: 'Turkey',
    dialCode: '+90',
    flag: '🇹🇷',
    placeholder: '532 123 4567',
    minDigits: 10,
    maxDigits: 10
  },
  {
    iso: 'GB',
    nameAr: 'المملكة المتحدة',
    nameEn: 'United Kingdom',
    dialCode: '+44',
    flag: '🇬🇧',
    placeholder: '7700 900077',
    minDigits: 10,
    maxDigits: 10
  },
  {
    iso: 'US',
    nameAr: 'الولايات المتحدة',
    nameEn: 'United States',
    dialCode: '+1',
    flag: '🇺🇸',
    placeholder: '202 555 0199',
    minDigits: 10,
    maxDigits: 10
  }
];

export function filterAuthCountries(query: string): AuthCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return AUTH_COUNTRIES;
  return AUTH_COUNTRIES.filter(
    (c) =>
      c.nameAr.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.iso.toLowerCase().includes(q)
  );
}
