export const MOODS = {
  vgood: {
    label: '매우 좋음', face: '#FFFDF8', blush: '#F79AA4', eyeRy: '10', browW: '5',
    browL: 'M64 78 Q76 62 90 72', browR: 'M110 72 Q124 62 136 78',
    y: 'hopVgood .95s infinite', s: 'shVgood .95s infinite', x: 'none', r: 'swayJoy 1.9s ease-in-out infinite',
    sentence: '오늘은 야구 얘기만 꺼내도 웃을 얼굴이에요. 먼저 말 걸어보세요.'
  },
  good: {
    label: '좋음', face: '#FBF7F2', blush: '#F6B3B3', eyeRy: '10', browW: '5',
    browL: 'M66 80 Q77 68 90 77', browR: 'M110 77 Q123 68 134 80',
    y: 'hopGood 1.5s infinite', s: 'shGood 1.5s infinite', x: 'none', r: 'none',
    sentence: '오늘은 인사에 웃음이 돌아올 것 같아요. 가볍게 말 걸어보세요.'
  },
  normal: {
    label: '보통', face: '#F7F3EE', blush: '#F2C7C5', eyeRy: '10', browW: '5',
    browL: 'M67 78 Q78 73 89 77', browR: 'M111 77 Q122 73 133 78',
    y: 'hopNormal 1.1s infinite', s: 'shNormal 1.1s infinite', x: 'none', r: 'none',
    sentence: '오늘은 평소처럼 대해도 괜찮아요. 굳이 야구 얘기를 꺼낼 필요는 없고요.'
  },
  bad: {
    label: '안 좋음', face: '#F6D3CF', blush: '#E98990', eyeRy: '9', browW: '6',
    browL: 'M66 72 L90 81', browR: 'M110 81 L134 72',
    y: 'hopBad .6s infinite', s: 'shBad .6s infinite', x: 'none', r: 'grumble 1.2s ease-in-out infinite',
    sentence: '오늘은 말 한마디에도 예민할 수 있어요. 야구 얘기는 잠시 넣어두세요.'
  },
  vbad: {
    label: '매우 안 좋음', face: '#EC7F79', blush: '#C9363F', eyeRy: '7', browW: '7',
    browL: 'M62 66 L92 84', browR: 'M108 84 L138 66',
    y: 'hopRage .42s infinite', s: 'shRage .42s infinite', x: 'rageX 1.68s linear infinite', r: 'shake .21s ease-in-out infinite alternate',
    sentence: '지금은 무슨 말이든 야구로 들릴 수 있어요. 오늘은 조용히 눈치부터 보세요.'
  }
};
export type MoodKey = keyof typeof MOODS;
export const ORDER: MoodKey[] = ['vgood', 'good', 'normal', 'bad', 'vbad'];
