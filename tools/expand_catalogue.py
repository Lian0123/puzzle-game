"""Author the 501–1000 world rules and the first 200 playable scenes."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = [
    ('晨曦智城','智慧建築、光軌與垂直花園。','⌘','techcity',5,'晨曦智城,光軌水巷,垂直綠塔,玻璃空橋,機械花市,晴空電車,晶片廣場,雲端書庫,全息穹廊,智慧運河,虹膜觀景臺,晨光機器園,鏡面車站,藍光步道,浮空咖啡庭,數位風車,白瓷能源塔,流光雨街,城市雲梯,未來之晨'),
    ('深海研究所','透明深海基地與發光的海洋科技。','≋','techsea',5,'深海研究所,水母能源艙,珊瑚實驗園,海底列車,潛航圓頂,藍鯨觀測窗,深溝光纜,水下玻璃庭,潮汐發電環,貝殼機器港,海藻培育塔,珍珠資料庫,靜海通訊站,水晶潛艇灣,熱泉採樣臺,海底燈光隧道,發光礁石站,深藍生態艙,海洋之眼,深海新紀元'),
    ('雲端航港','高空飛行器、空中花園與雲端碼頭。','✈','techsky',5,'雲端航港,浮空修理塢,飛行器花庭,太陽帆碼頭,空中物流塔,雲海玻璃站,懸翼發電場,翼下觀星臺,天際停機坪,雲朵環形橋,天空維修園,風帆研究艙,航道信標林,銀翼長廊,空中農場,雲港夜航,星光引擎室,浮島氣象站,破曉飛行臺,萬翼啟航'),
    ('機械綠洲','潔淨能源、機械植物與沙漠生態都市。','⚙','techgarden',5,'機械綠洲,太陽鏡花田,沙漠水循環,金屬蓮花池,風能棕櫚林,琥珀培育艙,玻璃種子庫,仿生蝴蝶園,露水收集塔,晶硅葡萄園,齒輪灌溉渠,機械鹿草原,沙丘能源站,綠色反應爐,人工雨花房,光伏梯田,風沙護盾城,智慧溫室夜,生態核心庭,萬物共生城'),
    ('星軌新境','軌道基地、月面建築與深空探索。','⊕','techorbit',5,'星軌新境,月面觀測環,軌道修船廠,零重力花房,銀河通訊陣,太空電梯站,隕石採礦城,行星科學館,光帆旅行港,月塵溫室,星際能源環,藍星觀景艙,太空農業帶,環形居住站,深空航標塔,木星研究窗,火星科研庭,日冕觀測臺,群星啟程港,明日之境'),
    ('花神序曲','慕夏風格的花卉、流動曲線與裝飾圓環。','❀','nouveauflowers',6,'鳶尾花神庭,百合金環,薔薇曲線廊,紫藤琺瑯窗,罌粟晨露,向日葵星盤,水仙月泉,山茶流金庭,木蘭花冠,風信子織園,鈴蘭羽飾,玫瑰石階,金雀花拱門,蓮華鏡苑,虞美人霞庭,鳶尾羽紋泉,百花琉璃閣,香草絲帶徑,花瓣環形窗,花神的曙光'),
    ('四季織夢','新藝術風格的四季、枝葉與細緻紋飾。','❧','nouveauseasons',6,'春之藤蔓,杏花織夢,新葉圓舞,春雨金窗,綠芽銅拱,夏之孔雀庭,睡蓮午夢,茉莉星輪,金穗夏風,葡萄月影,秋之琥珀,楓葉琺瑯橋,石榴暮庭,銀杏金幔,菊花露臺,冬之白薔薇,雪松銀環,霜葉玻璃宮,山茶冬燈,四季之冠'),
    ('琉璃藝廊','彩繪玻璃、琺瑯、金工與優雅建築。','◈','nouveauglass',6,'琉璃藝廊,蝴蝶彩窗,金線音樂廳,寶石書房,孔雀玻璃門,鳶尾水晶燈,藤紋旋梯,琺瑯鐘庭,花影拱頂,珍珠鏡廳,祖母綠陽臺,銅葉天井,花窗火車亭,瑪瑙小劇場,百合鑄鐵橋,流線畫室,羽紋瓷器庭,花蔓玻璃穹,金箔長廊,璀璨藝術殿'),
    ('星月花語','星象圓盤與夜色植物交織的裝飾風景。','☽','nouveaumoon',6,'月桂星盤,銀月百合池,星辰羽翼園,夜鶯薔薇廊,紫羅蘭月窗,睡蓮星河,金環天文庭,滿月藤花亭,晨星孔雀泉,銀葉夢之橋,月光琺瑯海,繁星石榴樹,天秤花影,新月玻璃舟,星紋玫瑰塔,藍夜花冠,流星金葉林,夜之百花宮,曙星圓舞,星月的祝福'),
    ('金色花園','以繁複植物紋樣與金色建築收束慕夏旅程。','✿','nouveaugold',6,'金色花園,蜂鳥寶石泉,藤蔓香水亭,花冠女神像,白孔雀花臺,珊瑚玫瑰廊,銅金百合塔,絲帶瀑泉,翡翠花窗橋,琥珀藤影宮,薔薇花海梯,瓷藍花卉閣,花紋音樂泉,孔雀羽環廳,植物寶石苑,萬花夕照,金葉夢境亭,琉璃花雨,新藝術之門,永恆花之冠'),
]
RULES = [
    dict(id=5,title='科技世界',label='科技世界',icon='⌘',start=500,end=600,theme='technology',description='穿越智慧都市、深海基地與星際航港。',style='精緻科幻環境插畫；清楚材質、可信建築、自然與科技共生。',routes=[r[0] for r in ROUTES[:5]],implemented=True),
    dict(id=6,title='慕夏風格世界',label='慕夏風格世界',icon='❀',start=600,end=700,theme='nouveau',description='循著花卉曲線、琉璃與金環，走進新藝術花園。',style='Alphonse Mucha 新藝術風格；植物曲線、精細輪廓、裝飾圓環、柔和礦物色與金線。',routes=[r[0] for r in ROUTES[5:]],implemented=True),
    dict(id=7,title='畢卡索風格世界',start=700,end=800,theme='cubism',style='立體主義；多重視角、平面切割、幾何結構、拼貼質感，保留主體辨識度。',routes=['藍色詩篇','玫瑰廣場','幾何山城','拼貼樂章','多面宇宙'],implemented=False),
    dict(id=8,title='達利風格世界',start=800,end=900,theme='surrealism',style='超現實夢境；精細寫實質感、變形尺度、懸浮物、夢境空間與長陰影。',routes=['夢境沙岸','時間花園','懸浮奇境','幻象回廊','無垠夢門'],implemented=False),
    dict(id=9,title='浮世繪世界',start=900,end=1000,theme='ukiyoe',style='木版畫；墨線、平塗色塊、套色層次、紙張質感與季節風景。',routes=['江戶晨行','東海道風物','花鳥四季','浪與群山','百景終章'],implemented=False),
]

if __name__ == '__main__':
    path=ROOT/'game-data.js'
    source=path.read_text()
    if "Authored expansion: 501–700" in source:
        raise SystemExit("Catalogue already expanded; resume art-upgrade-jobs.json instead.")
    titles=[]
    for title,description,icon,theme,world,items in ROUTES:
        names=items.split(',')
        assert len(names)==20, title
        titles.extend([[name,f'{title} · '+('科技' if world==5 else '新藝術')] for name in names])
    insertion='  // Authored expansion: 501–700; later world rules remain planned.\n  titles.push(...'+json.dumps(titles,ensure_ascii=False,indent=2)+');\n'
    source=source.replace('  const scenes=titles.map',insertion+'  const scenes=titles.map')
    chapters=[dict(title=t,description=d,icon=i,theme=th,worldId=w) for t,d,i,th,w,_ in ROUTES]
    active=[]
    for rule in RULES[:2]:
        world={k:v for k,v in rule.items() if k not in ('style','routes','implemented')}
        world['chapters']=list(range(rule['start']//20,rule['end']//20))
        active.append(world)
    insertion='  chapters.push(...'+json.dumps(chapters,ensure_ascii=False,indent=2)+');\n  worlds.push(...'+json.dumps(active,ensure_ascii=False,indent=2)+');\n  const worldRules='+json.dumps(RULES,ensure_ascii=False,indent=2)+';\n'
    source=source.replace('  const api={scenes,chapters,worlds,CHAPTER_SIZE,TOTAL_LEVELS:scenes.length};',insertion+'  const api={scenes,chapters,worlds,worldRules,CHAPTER_SIZE,TOTAL_LEVELS:scenes.length,PLANNED_LEVELS:1000};')
    path.write_text(source)
    scenes=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./game-data.js').scenes))"],cwd=ROOT))
    jobs=[]
    for scene in scenes:
        level=scene['index']+1
        if level<306 or level in (310,311,312,313): continue
        if level<=400:
            style='Exquisitely finished painterly prehistoric wilderness environment, fine botanical and geological details, realistic depth, rich natural materials, luminous atmospheric light.'
        elif level<=500:
            style='Exquisitely finished cinematic alien landscape illustration, imaginative coherent geology and ecology, intricate natural textures and carefully designed architecture, luminous atmospheric depth.'
        elif level<=600:
            style='Exquisitely finished premium science fiction environment painting, sophisticated believable futuristic architecture, precise material details, technology integrated with lush nature, cinematic atmospheric depth.'
        else:
            style='In the style of Alphonse Mucha: exquisite Art Nouveau illustration, sophisticated flowing botanical arabesques, graceful fine ink contours, intricate floral ornament, jewel-like stained glass and delicate gold accents, muted mineral pastels. Integrate ornamental circular motifs into a richly detailed landscape or architectural scene; no poster typography.'
        prompt=f"Use case: stylized-concept. Asset type: one premium square jigsaw puzzle illustration, stage {level}. Scene: {scene['title']} ({scene['subtitle']}). Interpret the specific scene faithfully and invent a distinctive composition. {style} Full bleed 1:1 single coherent scene. Layered detailed foreground, midground and distance; varied distinctive shapes and colors in every quadrant for recognizable 6x6 puzzle tiles. Exceptionally polished professional artwork, sophisticated lighting, rich handcrafted detail. No large blank areas, no crude polygons, no simplistic procedural appearance, no repeated patterns, no collage panels, no text, no signature, no logo, no watermark, no recreation of an existing painting. Exactly one image, 1024x1024 square."
        jobs.append(dict(level=level,title=scene['title'],subtitle=scene['subtitle'],file=f'landscape-{level}.jpg',prompt=prompt,status='pending'))
    (ROOT/'tools/art-upgrade-jobs.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2)+'\n')
