export const GROUPS = ['유치부', '초등저', '초등고', '중등부'];

export function generateSampleStudents(count = 200) {
  const lastNames = [
    '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
    '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍',
  ];
  const firstNames = [
    '민준', '서준', '도윤', '예준', '시우', '하준', '지호', '주원', '서연',
    '서윤', '지우', '하은', '민서', '지유', '채원', '수아', '다은', '은우',
  ];

  const list = [];
  for (let i = 1; i <= count; i++) {
    const id = 'S-' + String(i).padStart(3, '0');
    const name = lastNames[i % lastNames.length] + firstNames[(i * 7) % firstNames.length];
    const group = GROUPS[i % GROUPS.length];
    list.push({ id, name, group, defaultMinutes: 50 });
  }
  return list;
}
