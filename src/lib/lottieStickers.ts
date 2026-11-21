export interface LottieVectorKeyframe {
  t: number;
  s: number[];
  e?: number[];
  i?: { x: number | number[]; y: number | number[] };
  o?: { x: number | number[]; y: number | number[] };
}

export interface LottieProperty {
  a: 0 | 1;
  k: number | number[] | LottieVectorKeyframe[];
}

export interface LottieLayer {
  ddd: number;
  ind: number;
  ty: number;
  nm: string;
  sr: number;
  ks: {
    o: LottieProperty;
    r: LottieProperty;
    p: LottieProperty;
    a: LottieProperty;
    s: LottieProperty;
  };
  ao: number;
  shapes?: Record<string, unknown>[];
  ip: number;
  op: number;
  st: number;
  bm: number;
}

export interface LottieAnimationData {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm: string;
  ddd: number;
  assets: unknown[];
  layers: LottieLayer[];
}

function hexToLottieRgba(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [
    Math.round(r * 1000) / 1000,
    Math.round(g * 1000) / 1000,
    Math.round(b * 1000) / 1000,
    alpha
  ];
}

function easeVec(dim: number) {
  const arr = (val: number) => Array.from({ length: dim }, () => val);
  return {
    i: { x: arr(0.42), y: arr(0) },
    o: { x: arr(0.58), y: arr(1) }
  };
}

function kfSeries(frames: Array<{ t: number; s: number[] }>): LottieProperty {
  const dim = frames[0]?.s.length || 1;
  const { i, o } = easeVec(dim);
  return {
    a: 1,
    k: frames.map((item, idx) => {
      const next = frames[idx + 1];
      if (!next) {
        return { t: item.t, s: item.s };
      }
      return { t: item.t, s: item.s, e: next.s, i, o };
    })
  };
}

function staticProp(k: number | number[]): LottieProperty {
  return { a: 0, k };
}

function shapeTransform(x = 0, y = 0, scale = 100, opacity = 100, rotation = 0) {
  return {
    ty: 'tr',
    p: staticProp([x, y]),
    a: staticProp([0, 0]),
    s: staticProp([scale, scale]),
    r: staticProp(rotation),
    o: staticProp(opacity),
    sk: staticProp(0),
    sa: staticProp(0)
  };
}

function makeCircleLayer(
  ind: number,
  nm: string,
  x: number,
  y: number,
  size: number,
  hex: string,
  options?: {
    alpha?: number;
    scaleFrames?: Array<{ t: number; s: number[] }>;
    opacityFrames?: Array<{ t: number; s: number[] }>;
    posFrames?: Array<{ t: number; s: number[] }>;
    strokeHex?: string;
    strokeWidth?: number;
  }
): LottieLayer {
  const shapes: Record<string, unknown>[] = [
    {
      ty: 'el',
      d: 1,
      s: staticProp([size, size]),
      p: staticProp([0, 0]),
      nm: 'Ellipse'
    }
  ];
  if (options?.strokeHex) {
    shapes.push({
      ty: 'st',
      c: staticProp(hexToLottieRgba(options.strokeHex, options.alpha ?? 1)),
      o: staticProp(100),
      w: staticProp(options.strokeWidth ?? 6),
      lc: 2,
      lj: 2,
      nm: 'Stroke'
    });
  } else {
    shapes.push({
      ty: 'fl',
      c: staticProp(hexToLottieRgba(hex, options?.alpha ?? 1)),
      o: staticProp(100),
      r: 1,
      nm: 'Fill'
    });
  }
  shapes.push(shapeTransform());

  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: options?.opacityFrames ? kfSeries(options.opacityFrames) : staticProp(100),
      r: staticProp(0),
      p: options?.posFrames ? kfSeries(options.posFrames) : staticProp([x, y, 0]),
      a: staticProp([0, 0, 0]),
      s: options?.scaleFrames ? kfSeries(options.scaleFrames) : staticProp([100, 100, 100])
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: shapes,
        nm: 'Group'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

function makeStarLayer(
  ind: number,
  nm: string,
  x: number,
  y: number,
  outerR: number,
  innerR: number,
  points: number,
  hex: string,
  options?: {
    rotFrames?: Array<{ t: number; s: number[] }>;
    scaleFrames?: Array<{ t: number; s: number[] }>;
    posFrames?: Array<{ t: number; s: number[] }>;
    opacityFrames?: Array<{ t: number; s: number[] }>;
  }
): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: options?.opacityFrames ? kfSeries(options.opacityFrames) : staticProp(100),
      r: options?.rotFrames ? kfSeries(options.rotFrames) : staticProp(0),
      p: options?.posFrames ? kfSeries(options.posFrames) : staticProp([x, y, 0]),
      a: staticProp([0, 0, 0]),
      s: options?.scaleFrames ? kfSeries(options.scaleFrames) : staticProp([100, 100, 100])
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: [
          {
            ty: 'sr',
            sy: 1,
            d: 1,
            pt: staticProp(points),
            p: staticProp([0, 0]),
            r: staticProp(0),
            ir: staticProp(innerR),
            is: staticProp(0),
            or: staticProp(outerR),
            os: staticProp(0),
            nm: 'Polystar'
          },
          {
            ty: 'fl',
            c: staticProp(hexToLottieRgba(hex, 1)),
            o: staticProp(100),
            r: 1,
            nm: 'Fill'
          },
          shapeTransform()
        ],
        nm: 'StarGroup'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

function makeHeartPathLayer(
  ind: number,
  nm: string,
  x: number,
  y: number,
  hex: string,
  scaleFrames: Array<{ t: number; s: number[] }>
): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: staticProp(100),
      r: staticProp(0),
      p: staticProp([x, y, 0]),
      a: staticProp([0, 0, 0]),
      s: kfSeries(scaleFrames)
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: [
          {
            ty: 'sh',
            d: 1,
            ks: {
              a: 0,
              k: {
                i: [
                  [0, -14],
                  [-16, -24],
                  [-28, 0],
                  [-10, 18],
                  [10, 18],
                  [28, 0],
                  [16, -24]
                ],
                o: [
                  [-16, -24],
                  [-28, 0],
                  [-10, 18],
                  [0, 10],
                  [10, 18],
                  [28, 0],
                  [0, -14]
                ],
                v: [
                  [0, -10],
                  [-24, -26],
                  [-34, -2],
                  [-16, 22],
                  [0, 36],
                  [16, 22],
                  [34, -2],
                  [24, -26]
                ].slice(0, 7),
                c: true
              }
            },
            nm: 'HeartPath'
          },
          {
            ty: 'fl',
            c: staticProp(hexToLottieRgba(hex, 1)),
            o: staticProp(100),
            r: 1,
            nm: 'HeartFill'
          },
          shapeTransform()
        ],
        nm: 'HeartGroup'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

function makeCheckmarkLayer(ind: number, x: number, y: number, hex: string): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: 'CheckStroke',
    sr: 1,
    ks: {
      o: staticProp(100),
      r: kfSeries([
        { t: 0, s: [-10] },
        { t: 25, s: [6] },
        { t: 45, s: [-3] },
        { t: 60, s: [-10] }
      ]),
      p: staticProp([x, y, 0]),
      a: staticProp([0, 0, 0]),
      s: kfSeries([
        { t: 0, s: [88, 88, 100] },
        { t: 25, s: [114, 114, 100] },
        { t: 45, s: [98, 98, 100] },
        { t: 60, s: [88, 88, 100] }
      ])
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: [
          {
            ty: 'sh',
            d: 1,
            ks: {
              a: 0,
              k: {
                i: [
                  [0, 0],
                  [0, 0],
                  [0, 0]
                ],
                o: [
                  [0, 0],
                  [0, 0],
                  [0, 0]
                ],
                v: [
                  [-22, 2],
                  [-6, 18],
                  [24, -16]
                ],
                c: false
              }
            },
            nm: 'CheckPath'
          },
          {
            ty: 'st',
            c: staticProp(hexToLottieRgba(hex, 1)),
            o: staticProp(100),
            w: staticProp(11),
            lc: 2,
            lj: 2,
            nm: 'Stroke'
          },
          shapeTransform()
        ],
        nm: 'CheckGroup'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

function makeWaveArcLayer(
  ind: number,
  nm: string,
  x: number,
  y: number,
  hex: string,
  delayShift = 0
): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: kfSeries([
        { t: 0, s: [delayShift === 0 ? 90 : 35] },
        { t: 30, s: [delayShift === 0 ? 35 : 95] },
        { t: 60, s: [delayShift === 0 ? 90 : 35] }
      ]),
      r: staticProp(0),
      p: kfSeries([
        { t: 0, s: [x, y + 4, 0] },
        { t: 30, s: [x + (delayShift % 2 === 0 ? 4 : -4), y - 8, 0] },
        { t: 60, s: [x, y + 4, 0] }
      ]),
      a: staticProp([0, 0, 0]),
      s: staticProp([100, 100, 100])
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: [
          {
            ty: 'sh',
            d: 1,
            ks: {
              a: 0,
              k: {
                i: [
                  [0, 0],
                  [-8, 6],
                  [0, 0]
                ],
                o: [
                  [8, -6],
                  [0, 0],
                  [0, 0]
                ],
                v: [
                  [-6, 16],
                  [6, 0],
                  [-4, -16]
                ],
                c: false
              }
            },
            nm: 'SteamPath'
          },
          {
            ty: 'st',
            c: staticProp(hexToLottieRgba(hex, 1)),
            o: staticProp(100),
            w: staticProp(6),
            lc: 2,
            lj: 2,
            nm: 'SteamStroke'
          },
          shapeTransform()
        ],
        nm: 'SteamGroup'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

function makeRoundedRectLayer(
  ind: number,
  nm: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  hex: string,
  options?: {
    rotFrames?: Array<{ t: number; s: number[] }>;
    posFrames?: Array<{ t: number; s: number[] }>;
    scaleFrames?: Array<{ t: number; s: number[] }>;
  }
): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: staticProp(100),
      r: options?.rotFrames ? kfSeries(options.rotFrames) : staticProp(0),
      p: options?.posFrames ? kfSeries(options.posFrames) : staticProp([x, y, 0]),
      a: staticProp([0, 0, 0]),
      s: options?.scaleFrames ? kfSeries(options.scaleFrames) : staticProp([100, 100, 100])
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        it: [
          {
            ty: 'rc',
            d: 1,
            s: staticProp([w, h]),
            p: staticProp([0, 0]),
            r: staticProp(r),
            nm: 'Rect'
          },
          {
            ty: 'fl',
            c: staticProp(hexToLottieRgba(hex, 1)),
            o: staticProp(100),
            r: 1,
            nm: 'Fill'
          },
          shapeTransform()
        ],
        nm: 'RectGroup'
      }
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0
  };
}

const wrap = (nm: string, layers: LottieLayer[]): LottieAnimationData => ({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 160,
  h: 160,
  nm,
  ddd: 0,
  assets: [],
  layers
});

export const LOTTIE_STICKER_ANIMATIONS: Record<string, LottieAnimationData> = {
  lottie_heart_pulse: wrap('HeartPulse', [
    makeCircleLayer(1, 'OuterRing', 80, 80, 118, '#FFE4E6', {
      alpha: 0.35,
      strokeHex: '#FFE4E6',
      strokeWidth: 4,
      scaleFrames: [
        { t: 0, s: [82, 82, 100] },
        { t: 28, s: [112, 112, 100] },
        { t: 60, s: [82, 82, 100] }
      ],
      opacityFrames: [
        { t: 0, s: [80] },
        { t: 30, s: [18] },
        { t: 60, s: [80] }
      ]
    }),
    makeHeartPathLayer(2, 'MainHeart', 80, 78, '#FFF1F2', [
      { t: 0, s: [92, 92, 100] },
      { t: 16, s: [118, 118, 100] },
      { t: 30, s: [98, 98, 100] },
      { t: 44, s: [112, 112, 100] },
      { t: 60, s: [92, 92, 100] }
    ]),
    makeStarLayer(3, 'SparkLeft', 32, 38, 11, 5, 4, '#FDE047', {
      rotFrames: [
        { t: 0, s: [0] },
        { t: 60, s: [180] }
      ],
      scaleFrames: [
        { t: 0, s: [60, 60, 100] },
        { t: 30, s: [115, 115, 100] },
        { t: 60, s: [60, 60, 100] }
      ]
    }),
    makeStarLayer(4, 'SparkRight', 130, 42, 9, 4, 4, '#FDE047', {
      rotFrames: [
        { t: 0, s: [45] },
        { t: 60, s: [-135] }
      ],
      scaleFrames: [
        { t: 0, s: [110, 110, 100] },
        { t: 30, s: [55, 55, 100] },
        { t: 60, s: [110, 110, 100] }
      ]
    })
  ]),

  lottie_celebrate_confetti: wrap('CelebrateConfetti', [
    makeStarLayer(1, 'CenterStar', 80, 82, 40, 18, 5, '#FDE047', {
      rotFrames: [
        { t: 0, s: [-12] },
        { t: 30, s: [12] },
        { t: 60, s: [-12] }
      ],
      scaleFrames: [
        { t: 0, s: [92, 92, 100] },
        { t: 30, s: [115, 115, 100] },
        { t: 60, s: [92, 92, 100] }
      ]
    }),
    makeCircleLayer(2, 'Confetti1', 36, 40, 14, '#38BDF8', {
      posFrames: [
        { t: 0, s: [62, 68, 0] },
        { t: 35, s: [26, 26, 0] },
        { t: 60, s: [62, 68, 0] }
      ],
      opacityFrames: [
        { t: 0, s: [100] },
        { t: 45, s: [35] },
        { t: 60, s: [100] }
      ]
    }),
    makeCircleLayer(3, 'Confetti2', 124, 40, 14, '#FB7185', {
      posFrames: [
        { t: 0, s: [98, 68, 0] },
        { t: 35, s: [134, 28, 0] },
        { t: 60, s: [98, 68, 0] }
      ],
      opacityFrames: [
        { t: 0, s: [100] },
        { t: 45, s: [35] },
        { t: 60, s: [100] }
      ]
    }),
    makeRoundedRectLayer(4, 'Confetti3', 34, 122, 16, 8, 3, '#34D399', {
      rotFrames: [
        { t: 0, s: [0] },
        { t: 60, s: [360] }
      ],
      posFrames: [
        { t: 0, s: [56, 98, 0] },
        { t: 35, s: [28, 128, 0] },
        { t: 60, s: [56, 98, 0] }
      ]
    }),
    makeRoundedRectLayer(5, 'Confetti4', 126, 122, 16, 8, 3, '#FBBF24', {
      rotFrames: [
        { t: 0, s: [180] },
        { t: 60, s: [-180] }
      ],
      posFrames: [
        { t: 0, s: [104, 98, 0] },
        { t: 35, s: [132, 128, 0] },
        { t: 60, s: [104, 98, 0] }
      ]
    })
  ]),

  lottie_star_sparkle: wrap('StarSparkle', [
    makeCircleLayer(1, 'Halo', 80, 80, 102, '#FEF08A', {
      alpha: 0.28,
      scaleFrames: [
        { t: 0, s: [88, 88, 100] },
        { t: 30, s: [112, 112, 100] },
        { t: 60, s: [88, 88, 100] }
      ]
    }),
    makeStarLayer(2, 'BigStar', 80, 80, 44, 18, 4, '#FFFFFF', {
      rotFrames: [
        { t: 0, s: [0] },
        { t: 30, s: [45] },
        { t: 60, s: [90] }
      ],
      scaleFrames: [
        { t: 0, s: [94, 94, 100] },
        { t: 30, s: [114, 114, 100] },
        { t: 60, s: [94, 94, 100] }
      ]
    }),
    makeStarLayer(3, 'MiniStarA', 30, 36, 12, 5, 4, '#FDE047', {
      scaleFrames: [
        { t: 0, s: [60, 60, 100] },
        { t: 30, s: [120, 120, 100] },
        { t: 60, s: [60, 60, 100] }
      ]
    }),
    makeStarLayer(4, 'MiniStarB', 128, 122, 13, 5, 4, '#FDE047', {
      scaleFrames: [
        { t: 0, s: [120, 120, 100] },
        { t: 30, s: [60, 60, 100] },
        { t: 60, s: [120, 120, 100] }
      ]
    })
  ]),

  lottie_crescent_glow: wrap('CrescentGlow', [
    makeCircleLayer(1, 'MoonGlow', 80, 80, 114, '#FDE68A', {
      alpha: 0.25,
      scaleFrames: [
        { t: 0, s: [90, 90, 100] },
        { t: 30, s: [108, 108, 100] },
        { t: 60, s: [90, 90, 100] }
      ]
    }),
    makeCircleLayer(2, 'MoonBody', 76, 80, 68, '#FDE047', {
      posFrames: [
        { t: 0, s: [76, 82, 0] },
        { t: 30, s: [76, 74, 0] },
        { t: 60, s: [76, 82, 0] }
      ]
    }),
    makeCircleLayer(3, 'MoonCut', 94, 72, 58, '#312E81', {
      posFrames: [
        { t: 0, s: [94, 74, 0] },
        { t: 30, s: [94, 66, 0] },
        { t: 60, s: [94, 74, 0] }
      ]
    }),
    makeStarLayer(4, 'NightStar1', 122, 42, 13, 5, 5, '#FEF08A', {
      rotFrames: [
        { t: 0, s: [0] },
        { t: 60, s: [144] }
      ],
      scaleFrames: [
        { t: 0, s: [80, 80, 100] },
        { t: 30, s: [115, 115, 100] },
        { t: 60, s: [80, 80, 100] }
      ]
    }),
    makeStarLayer(5, 'NightStar2', 36, 116, 9, 4, 4, '#C7D2FE', {
      scaleFrames: [
        { t: 0, s: [110, 110, 100] },
        { t: 30, s: [65, 65, 100] },
        { t: 60, s: [110, 110, 100] }
      ]
    })
  ]),

  lottie_checkmark_pop: wrap('CheckmarkPop', [
    makeCircleLayer(1, 'PulseRing', 80, 80, 116, '#ECFDF5', {
      strokeHex: '#ECFDF5',
      strokeWidth: 4,
      scaleFrames: [
        { t: 0, s: [84, 84, 100] },
        { t: 30, s: [114, 114, 100] },
        { t: 60, s: [84, 84, 100] }
      ],
      opacityFrames: [
        { t: 0, s: [85] },
        { t: 35, s: [15] },
        { t: 60, s: [85] }
      ]
    }),
    makeCircleLayer(2, 'BadgeBg', 80, 80, 92, '#FFFFFF', {
      scaleFrames: [
        { t: 0, s: [94, 94, 100] },
        { t: 25, s: [108, 108, 100] },
        { t: 60, s: [94, 94, 100] }
      ]
    }),
    makeCheckmarkLayer(3, 80, 80, '#059669')
  ]),

  lottie_coffee_steam: wrap('CoffeeSteam', [
    makeWaveArcLayer(1, 'SteamLeft', 64, 38, '#FEF3C7', 0),
    makeWaveArcLayer(2, 'SteamRight', 96, 38, '#FDE68A', 1),
    makeRoundedRectLayer(3, 'CupBody', 80, 98, 66, 48, 14, '#FFFFFF', {
      posFrames: [
        { t: 0, s: [80, 100, 0] },
        { t: 30, s: [80, 96, 0] },
        { t: 60, s: [80, 100, 0] }
      ]
    }),
    makeRoundedRectLayer(4, 'CupSaucer', 80, 128, 86, 10, 5, '#FDE68A')
  ]),

  lottie_wave_hello: wrap('WaveHello', [
    makeCircleLayer(1, 'WaveRipple', 80, 80, 112, '#BAE6FD', {
      strokeHex: '#BAE6FD',
      strokeWidth: 5,
      scaleFrames: [
        { t: 0, s: [80, 80, 100] },
        { t: 35, s: [116, 116, 100] },
        { t: 60, s: [80, 80, 100] }
      ],
      opacityFrames: [
        { t: 0, s: [90] },
        { t: 40, s: [15] },
        { t: 60, s: [90] }
      ]
    }),
    makeRoundedRectLayer(2, 'WaveCard', 80, 80, 62, 62, 20, '#FFFFFF', {
      rotFrames: [
        { t: 0, s: [-14] },
        { t: 15, s: [16] },
        { t: 30, s: [-12] },
        { t: 45, s: [14] },
        { t: 60, s: [-14] }
      ],
      scaleFrames: [
        { t: 0, s: [95, 95, 100] },
        { t: 30, s: [108, 108, 100] },
        { t: 60, s: [95, 95, 100] }
      ]
    }),
    makeCircleLayer(3, 'WaveDot', 80, 80, 26, '#0284C7', {
      scaleFrames: [
        { t: 0, s: [90, 90, 100] },
        { t: 30, s: [120, 120, 100] },
        { t: 60, s: [90, 90, 100] }
      ]
    })
  ]),

  lottie_sun_rays: wrap('SunRays', [
    makeStarLayer(1, 'SunBurst', 80, 80, 56, 36, 10, '#FEF08A', {
      rotFrames: [
        { t: 0, s: [0] },
        { t: 60, s: [72] }
      ],
      scaleFrames: [
        { t: 0, s: [92, 92, 100] },
        { t: 30, s: [108, 108, 100] },
        { t: 60, s: [92, 92, 100] }
      ]
    }),
    makeCircleLayer(2, 'SunCore', 80, 80, 56, '#FFFFFF', {
      scaleFrames: [
        { t: 0, s: [96, 96, 100] },
        { t: 30, s: [106, 106, 100] },
        { t: 60, s: [96, 96, 100] }
      ]
    })
  ])
};

export function getLottieAnimationById(lottieId?: string): LottieAnimationData | undefined {
  if (!lottieId) return undefined;
  return LOTTIE_STICKER_ANIMATIONS[lottieId];
}

export function isValidLottieData(candidate: unknown): candidate is LottieAnimationData {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const obj = candidate as Record<string, unknown>;
  return (
    typeof obj.fr === 'number' &&
    obj.fr > 0 &&
    typeof obj.op === 'number' &&
    typeof obj.w === 'number' &&
    obj.w > 0 &&
    typeof obj.h === 'number' &&
    obj.h > 0 &&
    Array.isArray(obj.layers) &&
    obj.layers.length > 0
  );
}

export function cloneLottieData(data: LottieAnimationData): LottieAnimationData {
  return JSON.parse(JSON.stringify(data)) as LottieAnimationData;
}
