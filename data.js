window.CODEX_RELAY_DEFAULTS = {
  links: {
    oreue: "https://ncode.syosetu.com/n6511lv/",
    vendetta: "https://ncode.syosetu.com/n7301lx/",
    slipper_game: "https://keisi3926-bit.github.io/king-of-slipper/",
    slipper_alpha: "https://www.alphapolis.co.jp/novel/18028892",
    slipper_kakuyomu: "https://kakuyomu.jp/works/29120516960903045446",
    music_youtube: "https://www.youtube.com/"
  },
  templates: [
    {
      id: "oreue",
      name: "俺上",
      accent: "#f97316",
      body: "『俺上』更新しました。\n\n{link:oreue}\n\n#小説家になろう #Web小説"
    },
    {
      id: "vendetta",
      name: "Vendetta",
      accent: "#8b5cf6",
      body: "『Vendetta』最新話を公開しました。\n\n{link:vendetta}\n\n#小説家になろう #創作"
    },
    {
      id: "king-of-slipper",
      name: "キングオブスリッパ",
      accent: "#06b6d4",
      body: "『キングオブスリッパ』公開中。\n\nゲーム：{link:slipper_game}\nカクヨム：{link:slipper_kakuyomu}\n\n#ゲーム #Web小説"
    }
  ],
  sns: [
    {
      id: "x",
      name: "X",
      limit: 140,
      launchUrl: "https://twitter.com/intent/tweet?text={text}",
      supportsPrefill: true
    },
    {
      id: "tiktok",
      name: "TikTok",
      limit: 2200,
      launchUrl: "https://www.tiktok.com/upload",
      supportsPrefill: false
    },
    {
      id: "youtube-shorts",
      name: "YouTube Shorts",
      limit: 5000,
      launchUrl: "https://www.youtube.com/upload",
      supportsPrefill: false
    }
  ]
};
