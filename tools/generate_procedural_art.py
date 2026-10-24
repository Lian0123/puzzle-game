"""Create original painterly landscape art for the 301–500 game stages.

Five key rainforest pieces were composed with image_gen. This deterministic
generator fills the remaining catalogue with distinct, square scene paintings
so the full journey can ship without a large initial art download.
"""
from __future__ import annotations

import json
import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
IMAGEGEN_LEVELS = {301, 302, 303, 304, 305, 310, 311, 312, 313}
PALETTES = [
    ((63, 119, 118), (250, 207, 136), (48, 119, 91), (20, 53, 52), (35, 145, 157), (238, 183, 88)),
    ((131, 162, 170), (255, 214, 151), (157, 121, 89), (79, 70, 67), (33, 151, 170), (241, 206, 139)),
    ((43, 35, 43), (245, 121, 52), (63, 47, 45), (20, 26, 33), (176, 54, 29), (255, 180, 61)),
    ((35, 56, 91), (196, 219, 229), (100, 151, 184), (43, 70, 109), (53, 125, 160), (222, 241, 246)),
    ((83, 89, 100), (254, 179, 130), (157, 131, 113), (77, 83, 91), (68, 142, 145), (255, 218, 150)),
    ((55, 38, 71), (244, 147, 93), (165, 79, 54), (84, 53, 75), (178, 87, 60), (250, 188, 113)),
    ((47, 39, 93), (204, 169, 255), (78, 89, 154), (35, 39, 96), (58, 150, 177), (247, 171, 215)),
    ((12, 33, 66), (45, 100, 133), (37, 76, 86), (9, 28, 57), (23, 119, 135), (155, 255, 177)),
    ((35, 49, 84), (185, 190, 199), (104, 121, 133), (39, 53, 77), (50, 111, 127), (217, 183, 136)),
    ((13, 24, 72), (113, 112, 198), (56, 61, 130), (13, 21, 72), (41, 108, 169), (249, 206, 132)),
]


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(top, bottom):
    image = Image.new("RGB", (SIZE, SIZE))
    pixels = image.load()
    for y in range(SIZE):
        c = mix(top, bottom, y / (SIZE - 1))
        for x in range(SIZE):
            pixels[x, y] = c
    return image


def ridge(draw, rng, y, height, color, width=SIZE, offset=0):
    points = [(0, SIZE)]
    x = 0
    while x <= width:
        x += rng.randint(55, 125)
        points.append((min(x, width), y + rng.randint(-height, height) + offset))
    points.append((width, SIZE))
    draw.polygon(points, fill=color)


def glow(image, x, y, radius, color, opacity=110):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((x-radius, y-radius, x+radius, y+radius), fill=(*color, opacity))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * .55))
    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"))


def draw_stars(draw, rng, color, amount=130):
    for _ in range(amount):
        x, y = rng.randrange(SIZE), rng.randrange(20, 680)
        r = rng.choice((1, 1, 2, 3))
        draw.ellipse((x-r, y-r, x+r, y+r), fill=color)


def draw_tree(draw, rng, x, base, scale, leaf, trunk, accent):
    w, h = int(44*scale), int(300*scale)
    draw.polygon([(x-w//2, base), (x-w//3, base-h), (x+w//3, base-h), (x+w//2, base)], fill=trunk)
    for j in range(3):
        y = base - int(h*(.38 + j*.20))
        draw.line((x, y, x + rng.randint(-130, 130)*scale, y-int(75*scale)), fill=trunk, width=max(3, int(13*scale)))
    for _ in range(90):
        lx = x + rng.randint(-int(125*scale), int(125*scale))
        ly = base - h + rng.randint(-int(62*scale), int(72*scale))
        r = rng.randint(max(6,int(7*scale)), max(10,int(21*scale)))
        c = mix(leaf, accent, rng.random()*.45)
        draw.ellipse((lx-r,ly-r*.65,lx+r,ly+r*.65), fill=c)


def draw_fern(draw, rng, x, y, scale, color, accent):
    top = y - int(180*scale)
    draw.line((x, y, x + rng.randint(-40,40)*scale, top), fill=accent, width=max(2,int(5*scale)))
    for side in (-1, 1):
        for i in range(7):
            yy = y - int((35+i*19)*scale)
            length = int((32 + i*8)*scale)
            end = x + side*length
            draw.ellipse((end-10*scale, yy-8*scale, end+10*scale, yy+8*scale), fill=mix(color,accent,.25))


def draw_crystal(draw, rng, x, base, scale, color, light):
    w, h = int(rng.randint(38,90)*scale), int(rng.randint(130,300)*scale)
    tip=(x,base-h)
    left=(x-w//2,base-int(h*.72)); right=(x+w//2,base-int(h*.72))
    pts=[tip,left,(x-int(w*.42),base), (x+int(w*.38),base),right]
    draw.polygon(pts,fill=color)
    draw.polygon([tip,left,(x,base-int(h*.30))],fill=mix(color,light,.40))
    draw.polygon([tip,right,(x,base-int(h*.30))],fill=mix(color,(25,35,78),.30))
    draw.line((x,base-h,x,base),fill=mix(light,(255,255,255),.48),width=max(2,int(3*scale)))


def draw_arch(draw, x, y, w, h, color, width=20):
    draw.rectangle((x,y+h*.40,x+w*.17,y+h),fill=color)
    draw.rectangle((x+w*.83,y+h*.40,x+w,y+h),fill=color)
    pts=[]
    for n in range(31):
        t=math.pi - math.pi*n/30
        pts.append((x+w/2+math.cos(t)*w*.42,y+h*.42-math.sin(t)*h*.42))
    draw.line(pts,fill=color,width=width,joint="curve")


def draw_landmark(image, rng, index, colors):
    sky, sun, mid, dark, water, accent = colors
    draw=ImageDraw.Draw(image)
    route=(index-300)//20
    # A strong focal landmark changes its position and silhouette for every stage.
    focal_x=rng.randint(350,700)
    horizon=rng.randint(360,480)
    if route==0:  # rainforest
        ridge(draw,rng,horizon+120,70,mix(dark,mid,.35))
        fall_x=focal_x+rng.randint(-115,115)
        draw.line([(fall_x-15,horizon+45),(fall_x+5,575),(fall_x-25,650)],fill=(192,224,204),width=rng.randint(75,120),joint="curve")
        draw.line([(fall_x-14,horizon+40),(fall_x+6,575),(fall_x-26,651)],fill=water,width=rng.randint(42,70),joint="curve")
        pool=[(fall_x-280,700),(fall_x-160,662),(fall_x+20,688),(fall_x+190,650),(fall_x+330,720),(fall_x+300,930),(fall_x+110,1015),(fall_x-165,970),(fall_x-320,850)]
        draw.polygon(pool,fill=mix(water,(12,68,79),.25))
        for _ in range(16):
            x=fall_x+rng.randint(-250,250);y=rng.randint(740,940);w=rng.randint(25,105)
            draw.arc((x-w,y-11,x+w,y+12),180,350,fill=mix(accent,(202,240,214),.55),width=rng.randint(2,5))
        for side in (0,1):
            x=rng.randint(65,220) if side==0 else rng.randint(805,960)
            draw_tree(draw,rng,x,850,rng.uniform(1.25,1.75),mix(mid,accent,.28),dark,mid)
        for _ in range(7):
            x=rng.randint(100,940); y=rng.randint(640,970)
            draw_fern(draw,rng,x,y,rng.uniform(.65,1.5),mix(mid,accent,.2),accent)
        for side in (-1,1):
            vine_x=focal_x+side*rng.randint(170,260)
            vine=[(vine_x,300),(vine_x+side*30,420),(vine_x-side*10,520),(vine_x+side*48,650)]
            draw.line(vine,fill=mix(mid,dark,.3),width=8,joint="curve")
            for j in range(6):
                x=vine_x+side*rng.randint(-26,34);y=350+j*42
                draw.ellipse((x-15,y-8,x+15,y+8),fill=mix(mid,accent,.22))
    elif route==1:  # ancient river valley
        wall_l=mix(mid,(193,128,79),.35);wall_r=mix(mid,(102,73,65),.28)
        left=[(0,250),(130,185),(225,278),(305,205),(390,335),(355,650),(275,795),(0,870)]
        right=[(1024,215),(915,180),(830,270),(748,205),(660,330),(700,605),(800,790),(1024,850)]
        draw.polygon(left,fill=wall_l);draw.polygon(right,fill=wall_r)
        for wall,shade in ((left,mix(wall_l,(70,54,49),.33)),(right,mix(wall_r,(230,171,111),.2))):
            x_min=min(p[0] for p in wall);x_max=max(p[0] for p in wall)
            for band in range(5):
                yy=330+band*75+rng.randint(-16,16)
                draw.line((x_min,yy,x_max,yy+rng.randint(-18,20)),fill=shade,width=rng.randint(5,12))
            for _ in range(24):
                x=rng.randint(x_min,x_max);y=rng.randint(280,710);r=rng.randint(5,19)
                draw.ellipse((x-r,y-r,x+r,y+r),fill=mix(shade,accent,rng.random()*.34))
        river=[(focal_x-15,horizon),(focal_x+115,545),(focal_x-130,665),(focal_x+30,815),(focal_x-55,1024)]
        draw.line(river,fill=mix(mid,dark,.3),width=210,joint="curve")
        draw.line(river,fill=water,width=155,joint="curve")
        draw.line([(x-20,y) for x,y in river],fill=mix(water,(211,237,208),.5),width=7,joint="curve")
        for _ in range(24):
            x=focal_x+rng.randint(-130,130);y=rng.randint(590,990);w=rng.randint(14,72)
            draw.ellipse((x-w,y-12,x+w,y+14),fill=mix(accent,(69,106,92),rng.random()*.46))
            draw.arc((x-w*.55,y-8,x+w*.55,y+10),180,345,fill=(207,227,201),width=2)
    elif route==2:  # volcanic
        peak=(focal_x,rng.randint(100,220))
        draw.polygon([(focal_x-445,890),(focal_x-310,520), (focal_x-170,330),peak,(focal_x+170,330),(focal_x+320,540),(focal_x+450,900)],fill=mix(mid,(112,63,47),.45))
        draw.polygon([(focal_x-160,365),peak,(focal_x+175,365),(focal_x+315,610),(focal_x+400,900),(focal_x-385,900)],fill=mix(mid,dark,.42))
        draw.line([(focal_x-210,425),(focal_x-100,505),(focal_x-35,650),(focal_x-20,865)],fill=mix(mid,accent,.32),width=9,joint="curve")
        draw.line([(focal_x+110,455),(focal_x+55,590),(focal_x+180,715),(focal_x+205,900)],fill=mix(mid,(240,132,73),.38),width=7,joint="curve")
        crater=[(focal_x-150,peak[1]+154),(focal_x-85,peak[1]+112),(focal_x-18,peak[1]+134),(focal_x+42,peak[1]+109),(focal_x+118,peak[1]+138),(focal_x+158,peak[1]+184),(focal_x+105,peak[1]+218),(focal_x-103,peak[1]+213)]
        draw.polygon(crater,fill=(33,28,30));draw.line(crater+[crater[0]],fill=(217,72,35),width=13,joint="curve")
        if index%4!=0:
            pts=[(focal_x+35,peak[1]+200),(focal_x+105,390),(focal_x+35,500),(focal_x+140,610),(focal_x+80,720),(focal_x+245,815),(focal_x+290,1024)]
            draw.line(pts,fill=(105,37,30),width=104,joint="curve")
            draw.line(pts,fill=(227,61,23),width=67,joint="curve")
            draw.line(pts,fill=(255,178,65),width=23,joint="curve")
            for branch in range(3):
                bx=focal_x+rng.randint(-260,260);by=rng.randint(670,930)
                branch_pts=[(bx,by),(bx+rng.randint(-40,40),by+45),(bx+rng.randint(-100,100),by+100)]
                draw.line(branch_pts,fill=(255,141,46),width=12,joint="curve")
        for _ in range(170):
            x,y=rng.randrange(SIZE),rng.randrange(430,SIZE)
            r=rng.randint(2,8);draw.ellipse((x-r,y-r,x+r,y+r),fill=mix(dark,accent,rng.random()*.7))
    elif route==3:  # ice age
        for x in (-80,220,560,800):
            peak_y=rng.randint(80,260)
            draw.polygon([(x-190,580),(x,peak_y),(x+190,580),(x+115,780),(x-140,800)],fill=mix(mid,water,rng.random()*.25))
            draw.polygon([(x-70,peak_y+110),(x,peak_y),(x+65,peak_y+100),(x+5,peak_y+75)],fill=(237,248,249))
        draw.polygon([(0,720),(250,660),(430,740),(610,650),(800,740),(1024,650),(1024,1024),(0,1024)],fill=mix(water,(12,40,75),.22))
        variant=index%5
        if variant==0:  # aurora over a glacial shelf
            for band in range(4):
                pts=[]
                for x in range(-80,1120,55):pts.append((x,390+band*42+math.sin((x+index*9)/125)*52))
                draw.line(pts,fill=mix(accent,(84,255,216),.55),width=18-band*3,joint="curve")
        elif variant==1:  # a blue ice cave
            draw_arch(draw,focal_x-235,520,470,360,mix(water,(199,242,255),.52),38)
            draw.polygon([(focal_x-190,850),(focal_x-80,665),(focal_x+10,850),(focal_x+95,700),(focal_x+210,900)],fill=mix(mid,water,.55))
        elif variant==2:  # frozen waterfall and pool
            fall_x=focal_x+rng.randint(-120,120)
            draw.line([(fall_x-30,390),(fall_x,540),(fall_x+15,800)],fill=(222,246,250),width=125,joint="curve")
            draw.line([(fall_x-10,405),(fall_x+12,555),(fall_x+20,790)],fill=mix(water,(233,251,255),.28),width=48,joint="curve")
        elif variant==3:  # cracked lake beneath a low ice ridge
            for _ in range(19):
                x=rng.randint(0,SIZE);y=rng.randint(720,1010)
                draw.line((x,y,x+rng.randint(-130,130),y-rng.randint(12,80)),fill=(190,231,244),width=rng.randint(2,7))
            draw.ellipse((focal_x-170,650,focal_x+180,825),fill=mix(water,(38,114,146),.32),outline=(211,241,248),width=9)
        else:  # wind-carved ice towers
            for x in (focal_x-230,focal_x+185):
                draw_crystal(draw,rng,x,855,rng.uniform(.8,1.25),mix(mid,water,.36),(226,248,253))
        for _ in range(70):
            x,y=rng.randrange(SIZE),rng.randrange(690,SIZE);draw.line((x,y,x+rng.randint(-30,30),y-rng.randint(5,28)),fill=mix(water,(208,236,247),.35),width=rng.randint(1,4))
    elif route==4:  # first dawn coast
        draw.ellipse((focal_x-230,300,focal_x+230,540),fill=mix(water,(230,164,111),.38))
        draw.polygon([(0,500),(200,430),(340,510),(530,420),(750,500),(1024,420),(1024,1024),(0,1024)],fill=mix(mid,dark,.2))
        for _ in range(17):
            x=rng.randint(70,950);y=rng.randint(560,930);w=rng.randint(32,100)
            draw.ellipse((x-w,y-w*.35,x+w,y+w*.35),fill=mix(water,accent,rng.random()*.48))
            draw.ellipse((x-w*.45,y-w*.13,x+w*.45,y+w*.13),fill=mix((255,220,160),sun,.35))
        for x in (180,520,840):
            draw.line((x,550,x+rng.randint(-12,12),360),fill=(232,231,218),width=7)
            draw.ellipse((x-25,340,x+25,370),fill=(229,233,222))
    elif route==5:  # alien red desert
        draw.ellipse((focal_x-100,120,focal_x+100,320),fill=sun)
        draw.ellipse((focal_x+240,210,focal_x+315,285),fill=mix(sun,(147,117,204),.4))
        ridge(draw,rng,420,100,mix(mid,dark,.20))
        for layer in range(3):
            y=570+layer*130
            pts=[(0,SIZE),(0,y)]
            for x in range(0,SIZE+90,90):pts.append((x,y+rng.randint(-75,90)))
            pts.extend([(SIZE,SIZE)])
            draw.polygon(pts,fill=mix(mid,dark,layer*.22))
        variant=index%5
        if variant<2:
            crater_x=focal_x+rng.randint(-170,170);crater_y=rng.randint(650,825);crater_w=rng.randint(115,210)
            draw.ellipse((crater_x-crater_w,crater_y-65,crater_x+crater_w,crater_y+72),outline=accent,width=15)
            draw.ellipse((crater_x-crater_w*.65,crater_y-38,crater_x+crater_w*.65,crater_y+45),outline=mix(accent,sun,.3),width=8)
            draw.ellipse((crater_x-crater_w*.28,crater_y-20,crater_x+crater_w*.28,crater_y+25),fill=mix(dark,(39,43,83),.35))
        elif variant==2:  # buried unmarked probe ruins
            base=rng.randint(730,900);rx=focal_x+rng.randint(-190,190)
            draw.polygon([(rx-95,base),(rx-62,base-175),(rx+55,base-175),(rx+92,base)],fill=mix(dark,mid,.42))
            draw.polygon([(rx-62,base-175),(rx,base-248),(rx+55,base-175)],fill=mix(accent,sun,.35))
            draw.line((rx-180,base-25,rx+190,base-25),fill=mix(accent,sun,.55),width=10)
            for side in (-1,1):draw.line((rx+side*85,base-92,rx+side*175,base-150),fill=accent,width=8)
        elif variant==3:  # impact glass field
            for _ in range(8):
                x=rng.randint(150,880);base=rng.randint(700,990)
                draw_crystal(draw,rng,x,base,rng.uniform(.55,1.05),mix((105,100,166),accent,.24),(236,205,235))
        else:  # a sweeping dust storm
            for band in range(5):
                y=570+band*76
                pts=[(rng.randint(-100,100),y)]
                for x in range(120,1160,120):pts.append((x,y+int(math.sin((x+index*30)/145+band)*50)))
                draw.line(pts,fill=mix(accent,(126,80,130),.42),width=rng.randint(18,35),joint="curve")
        for _ in range(80):
            x,y=rng.randrange(SIZE),rng.randrange(520,SIZE);r=rng.randint(2,7)
            draw.ellipse((x-r,y-r,x+r,y+r),fill=mix(dark,sun,rng.random()*.35))
    elif route==6:  # crystal ring canyon
        for x in (rng.randint(40,250),rng.randint(280,520),rng.randint(650,950)):
            draw_crystal(draw,rng,x,850,rng.uniform(.8,1.45),mix(mid,accent,.22),mix(sun,(245,235,255),.45))
        draw.polygon([(0,520),(160,390),(290,560),(430,385),(600,570),(780,350),(1024,500),(1024,1024),(0,1024)],fill=mix(dark,mid,.35))
        draw.line([(0,820),(220,750),(440,850),(690,740),(1024,810)],fill=water,width=70,joint="curve")
        draw.line([(0,820),(220,750),(440,850),(690,740),(1024,810)],fill=(205,242,255),width=8,joint="curve")
        # Foreground crystal spires sit above the river so every crop has a clear landmark.
        for x in (rng.randint(60,240),rng.randint(300,520),rng.randint(690,960)):
            draw_crystal(draw,rng,x,rng.randint(875,1000),rng.uniform(.95,1.6),mix(mid,accent,.32),mix(sun,(245,241,255),.45))
        variant=index%5
        if variant==0:
            draw_arch(draw,focal_x-185,480,370,330,mix(water,(212,228,255),.4),28)
        elif variant==1:
            for x in (focal_x-180,focal_x+150):
                draw.ellipse((x-70,580,x+70,630),fill=mix(mid,accent,.28))
                draw_crystal(draw,rng,x,600,.58,mix(mid,accent,.38),mix(sun,(248,230,255),.4))
        elif variant==2:
            draw.ellipse((focal_x-180,575,focal_x+180,780),outline=mix(sun,(255,240,255),.42),width=16)
            draw.ellipse((focal_x-125,610,focal_x+125,744),outline=accent,width=8)
        elif variant==3:
            draw.line([(focal_x-220,520),(focal_x-95,430),(focal_x+20,545),(focal_x+145,420),(focal_x+245,535)],fill=mix(sun,(255,245,255),.35),width=18,joint="curve")
        else:
            for _ in range(30):
                x=rng.randint(100,920);y=rng.randint(410,720);r=rng.randint(8,20)
                draw.polygon([(x,y-r),(x+r,y),(x,y+r),(x-r,y)],fill=mix(accent,(231,214,255),rng.random()*.6))
    elif route==7:  # bioluminescent ecology
        for x in range(55,1024,145):
            h=rng.randint(120,270);w=rng.randint(30,75);base=rng.randint(770,980)
            draw.ellipse((x-w,base-h-w,x+w,base-h+w),fill=mix(mid,accent,.3))
            draw.rectangle((x-8,base-h,x+8,base),fill=dark)
            glow(image,x,base-h,80,accent,100)
        for _ in range(28):
            x=rng.randrange(SIZE);y=rng.randrange(480,970);r=rng.randint(9,27)
            draw.ellipse((x-r,y-r,x+r,y+r),fill=mix(accent,(211,255,194),rng.random()*.6))
            glow(image,x,y,r*2,accent,90)
        draw.line([(0,780),(220,730),(450,840),(760,730),(1024,810)],fill=water,width=45,joint="curve")
    elif route==8:  # ancient city ruins
        for x in range(70,1000,170):
            w=rng.randint(75,145);h=rng.randint(180,420);y=horizon-rng.randint(20,100)
            draw.rectangle((x,y,x+w,y+h),fill=mix(mid,dark,rng.random()*.42))
            draw.rectangle((x+15,y+25,x+w-14,y+h),fill=mix(mid,dark,.25))
            for yy in range(y+45,y+h-20,55):
                for xx in range(x+22,x+w-15,38):
                    draw.rectangle((xx,yy,xx+14,yy+24),fill=mix(sky,(28,37,75),.48))
        draw_arch(draw,focal_x-170,390,340,390,mix(mid,accent,.16),24)
        for _ in range(18):
            x=rng.randint(20,1000);y=rng.randint(720,960)
            draw.ellipse((x,y,x+rng.randint(20,70),y+rng.randint(12,34)),fill=mix(mid,(58,104,83),.5))
    else:  # cosmic gateway
        draw_stars(draw,rng,(207,225,255),160)
        draw.ellipse((focal_x-280,180,focal_x+300,440),outline=mix(sun,(178,137,255),.25),width=26)
        draw.ellipse((focal_x-230,210,focal_x+250,410),outline=mix(water,(244,188,240),.28),width=18)
        draw_arch(draw,focal_x-160,440,320,480,mix(accent,sun,.18),28)
        draw.polygon([(0,780),(180,690),(370,790),(600,690),(820,790),(1024,700),(1024,1024),(0,1024)],fill=mix(dark,mid,.26))
        for x in (110,900):
            draw.ellipse((x-90,760,x+90,815),fill=mix(mid,water,.3))
            draw.ellipse((x-48,745,x+48,780),fill=accent)
        variant=index%5
        if variant==0:  # orbit garden
            for x in (focal_x-220,focal_x+185):
                draw.ellipse((x-115,700,x+115,770),fill=mix(mid,water,.48))
                for j in range(3):
                    top=600-rng.randint(0,70)
                    draw.line((x-55+j*50,720,x-60+j*50,top+35),fill=mix(accent,(142,204,155),.35),width=8)
                    leaf_y=top+rng.randint(-12,12)
                    draw.ellipse((x-78+j*50,leaf_y,x-38+j*50,leaf_y+40),fill=mix(accent,(163,225,177),.3))
        elif variant==1:  # comet passage
            comet=[(80,360),(225,310),(395,250),(560,210)]
            draw.line(comet,fill=mix(sun,(229,242,255),.4),width=28,joint="curve")
            draw.ellipse((530,170,650,290),fill=mix(sun,(255,241,205),.28))
        elif variant==2:  # orbital observatory
            draw.ellipse((focal_x-250,290,focal_x+250,500),outline=mix(sun,(233,230,255),.5),width=12)
            for x in (focal_x-145,focal_x+145):
                draw.rectangle((x-24,530,x+24,750),fill=mix(mid,accent,.28))
                draw.ellipse((x-77,510,x+77,550),fill=mix(water,(215,219,255),.35))
        elif variant==3:  # eclipsed ring world
            draw.ellipse((focal_x-170,230,focal_x+170,570),fill=mix(sky,(32,39,104),.35),outline=mix(sun,accent,.42),width=10)
            draw.arc((focal_x-300,300,focal_x+300,510),190,350,fill=mix(sun,(237,176,255),.38),width=22)
        else:  # a broad nebula ribbon
            for band in range(5):
                pts=[]
                for x in range(-60,1120,48):pts.append((x,560+band*30+int(math.sin((x+index*19)/150)*75)))
                draw.line(pts,fill=mix(water,(210,134,230),.45),width=18-band*2,joint="curve")


def make_scene(scene):
    index=scene["index"]
    route=(index-300)//20
    rng=random.Random(index*7919 + sum(ord(c) for c in scene["title"]))
    sky,sun,mid,dark,water,accent=PALETTES[route]
    image=gradient(sky,mix(sky,mid,.48))
    draw=ImageDraw.Draw(image)
    if route in (2,5,6):
        cx=rng.randint(260,770);cy=rng.randint(105,255);r=rng.randint(55,110)
        glow(image,cx,cy,r*2,sun,105)
        draw=ImageDraw.Draw(image);draw.ellipse((cx-r,cy-r,cx+r,cy+r),fill=sun)
    elif route in (3,7,8,9) or index%5==3:
        draw_stars(draw,rng,mix(sun,(240,245,255),.4),110)
        cx=rng.randint(200,820);cy=rng.randint(100,285);r=rng.randint(42,78)
        draw.ellipse((cx-r,cy-r,cx+r,cy+r),fill=mix(sky,sun,.38))
    else:
        cx=rng.randint(230,790);cy=rng.randint(115,250);r=rng.randint(58,104)
        glow(image,cx,cy,r*2,sun,65)
        draw=ImageDraw.Draw(image);draw.ellipse((cx-r,cy-r,cx+r,cy+r),fill=mix(sun,(255,237,196),.2))
    draw=ImageDraw.Draw(image)
    for _ in range(5):
        x=rng.randint(-100,920);y=rng.randint(115,335);w=rng.randint(75,180)
        cloud=mix(sky,(238,225,205),.18)
        draw.ellipse((x,y,x+w,y+rng.randint(14,34)),fill=cloud)
    ridge(draw,rng,360,80,mix(mid,sky,.30))
    ridge(draw,rng,450,95,mix(mid,dark,.24))
    draw_landmark(image,rng,index,(sky,sun,mid,dark,water,accent))
    draw=ImageDraw.Draw(image)
    # Fine marks give the faceted painting a handmade paper texture and puzzle detail.
    for _ in range(900):
        x,y=rng.randrange(SIZE),rng.randrange(430,SIZE)
        color=mix(mid,accent,rng.random()*.34)
        radius=rng.choice((1,1,1,2))
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=color)
    for _ in range(48):
        x,y=rng.randrange(SIZE),rng.randrange(420,SIZE)
        draw.line((x,y,x+rng.randint(8,48),y-rng.randint(1,10)),fill=mix(accent,mid,.32),width=rng.randint(1,4))
    # Low-frequency pigment variation softens flat fills into a paper-and-gouache finish.
    grain=Image.effect_noise((256,256),34).resize((SIZE,SIZE),Image.Resampling.BICUBIC).convert("RGB")
    image=Image.blend(image,ImageChops.soft_light(image,grain),.24)
    return image


def main():
    root=Path(__file__).resolve().parents[1]
    if len(sys.argv)>1:
        scenes=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        raw=subprocess.check_output(["node","-e",'process.stdout.write(JSON.stringify(require("./game-data.js").scenes))'],cwd=root)
        scenes=json.loads(raw)
    for scene in scenes:
        if scene["index"]<300 or scene["index"]+1 in IMAGEGEN_LEVELS:
            continue
        target=root/scene["url"]
        make_scene(scene).save(target,"JPEG",quality=84,optimize=True,progressive=True)
    manifest_path=root/"assets/level-art-manifest.json"
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    recorded={entry["level"] for entry in manifest}
    for scene in scenes:
        level=scene["index"]+1
        if level<301:
            continue
        generated=level in IMAGEGEN_LEVELS
        tool="built-in image_gen" if generated else "procedural painterly generator"
        prompt=(
            f"One original square painterly landscape for stage {level}, ‘{scene['title']}’ ({scene['subtitle']}); "
            f"{scene['title']} is the focal landmark in a richly detailed {('primeval rainforest' if level<321 else 'prehistoric landscape' if level<401 else 'original alien landscape')} travel scene. "
            "Use a full-bleed 1:1 composition with foreground, middle distance, distant landforms and varied colors in every quadrant for 4x4–6x6 jigsaw play; no text, logos, watermark, frame or people."
            if generated else
            f"Rendered by tools/generate_procedural_art.py as an original 1024x1024 landscape painting for stage {level}, ‘{scene['title']}’ ({scene['subtitle']}). "
            "The deterministic painterly scene uses the route palette, landmark shapes, terrain layers, water or sky details and fine texture; it contains no text or interface elements."
        )
        entry=next((item for item in manifest if item["level"]==level),None)
        if entry:
            if generated:
                entry.update({"title":scene["title"],"subtitle":scene["subtitle"],"file":Path(scene["url"]).name,"tool":tool,"prompt":prompt})
        else:
            manifest.append({"level":level,"title":scene["title"],"subtitle":scene["subtitle"],"file":Path(scene["url"]).name,"tool":tool,"prompt":prompt})
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit("Archived generator: use built-in image_gen and record_generated_art.py; do not overwrite finished artwork.")
