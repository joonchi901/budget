/** Uga icon and avatar names. Plain data so the server can validate saved names too. */
export const UGA_ICON_NAMES = [
  'home',
  'ledger',
  'assets',
  'payments',
  'analytics',
  'planning',
  'tags',
  'data',
  'bone',
  'bones',
  'heart',
  'star',
  'sprout',
  'meat',
  'moneybag',
] as const;

export const UGA_MOODS = ['happy', 'calm', 'surprise', 'sleep'] as const;

/**
 * Uga stickers people can react to a record with (public/brand/reactions/manifest.json). 대화
 * stickers come first as everyday replies; 감정 stickers follow.
 */
export const UGA_REACTIONS = [
  { id: 'nodding', label: '끄덕끄덕', group: '대화' },
  { id: 'aha', label: '아하', group: '대화' },
  { id: 'agree', label: '좋아요', group: '대화' },
  { id: 'pass', label: '이번엔 패스', group: '대화' },
  { id: 'clarify', label: '어느 쪽이에요?', group: '대화' },
  { id: 'one-moment', label: '잠깐만요', group: '대화' },
  { id: 'try-again', label: '앗, 다시', group: '대화' },
  { id: 'empathy', label: '그럴 때도 있죠', group: '대화' },
  { id: 'encourage', label: '같이 해봐요', group: '대화' },
  { id: 'thanks', label: '고마워요', group: '대화' },
  { id: 'all-done', label: '다 됐어요', group: '대화' },
  { id: 'see-you', label: '다음에 봐요', group: '대화' },
  { id: 'furious', label: '버럭', group: '감정' },
  { id: 'holding-anger', label: '꾹 참는 화', group: '감정' },
  { id: 'annoyed', label: '짜증', group: '감정' },
  { id: 'wronged', label: '억울함', group: '감정' },
  { id: 'pouting', label: '입 삐죽', group: '감정' },
  { id: 'turned-away', label: '토라져서 등 돌림', group: '감정' },
  { id: 'disappointed', label: '서운함', group: '감정' },
  { id: 'teary', label: '울먹울먹', group: '감정' },
  { id: 'sobbing', label: '엉엉', group: '감정' },
  { id: 'startled-guilty', label: '뜨끔', group: '감정' },
  { id: 'sheepish', label: '머쓱', group: '감정' },
  { id: 'skeptical', label: '갸우뚱', group: '감정' },
  { id: 'exhausted', label: '기진맥진', group: '감정' },
  { id: 'relieved', label: '휴, 다행이다', group: '감정' },
  { id: 'cracking-up', label: '빵 터짐', group: '감정' },
  { id: 'proud', label: '혼자 뿌듯', group: '감정' },
  { id: 'make-up', label: '슬쩍 화해', group: '감정' },
  { id: 'party-popper', label: '축하해요', group: '감정' },
] as const;
