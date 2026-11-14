export const MOODS = {
  vgood: {
    label: '매우 좋음', face: '#FFFDF8', blush: '#F79AA4', eyeRy: '10', browW: '5',
    browL: 'M64 78 Q76 62 90 72', browR: 'M110 72 Q124 62 136 78',
    y: 'hopVgood .95s infinite', s: 'shVgood .95s infinite', x: 'none', r: 'swayJoy 1.9s ease-in-out infinite',
    sentence: 'LG가 연승 중이라, 내일은 먼저 야구 얘기를 꺼내면 오히려 반가워해요.'
  },
  good: {
    label: '좋음', face: '#FBF7F2', blush: '#F6B3B3', eyeRy: '10', browW: '5',
    browL: 'M66 80 Q77 68 90 77', browR: 'M110 77 Q123 68 134 80',
    y: 'hopGood 1.5s infinite', s: 'shGood 1.5s infinite', x: 'none', r: 'none',
    sentence: '어제 이겼으니, 내일은 웃으면서 인사해도 괜찮아요.'
  },
  normal: {
    label: '보통', face: '#F7F3EE', blush: '#F2C7C5', eyeRy: '10', browW: '5',
    browL: 'M67 78 Q78 73 89 77', browR: 'M111 77 Q122 73 133 78',
    y: 'hopNormal 1.1s infinite', s: 'shNormal 1.1s infinite', x: 'none', r: 'none',
    sentence: '승패가 반반이라, 내일은 평소처럼 통통 지나갈 거예요.'
  },
  bad: {
    label: '안 좋음', face: '#F6D3CF', blush: '#E98990', eyeRy: '9', browW: '6',
    browL: 'M66 72 L90 81', browR: 'M110 81 L134 72',
    y: 'hopBad .6s infinite', s: 'shBad .6s infinite', x: 'none', r: 'grumble 1.2s ease-in-out infinite',
    sentence: 'LG의 연패로, 내일은 말 한마디에도 조심해야 해요.'
  },
  vbad: {
    label: '매우 안 좋음', face: '#EC7F79', blush: '#C9363F', eyeRy: '7', browW: '7',
    browL: 'M62 66 L92 84', browR: 'M108 84 L138 66',
    y: 'hopRage .42s infinite', s: 'shRage .42s infinite', x: 'rageX 1.68s linear infinite', r: 'shake .21s ease-in-out infinite alternate',
    sentence: '5연패에 끝내기 역전패까지. 내일은 최대한 마주치지 마세요.'
  }
};
export type MoodKey = keyof typeof MOODS;
export const ORDER: MoodKey[] = ['vgood', 'good', 'normal', 'bad', 'vbad'];
