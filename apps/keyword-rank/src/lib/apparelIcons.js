import tankTop from '../assets/apparel-icons/tank-top.png';
import jacket from '../assets/apparel-icons/jacket.png';
import sweater from '../assets/apparel-icons/sweater.png';
import tshirt from '../assets/apparel-icons/tshirt.png';
import sleevelessTshirt from '../assets/apparel-icons/sleeveless-tshirt.png';
import hoodedJacket from '../assets/apparel-icons/hooded-jacket.png';
import shirt from '../assets/apparel-icons/shirt.png';
import polo from '../assets/apparel-icons/polo.png';
import sweatshirt from '../assets/apparel-icons/sweatshirt.png';
import hoodie from '../assets/apparel-icons/hoodie.png';
import pufferCoat from '../assets/apparel-icons/puffer-coat.png';
import bomberJacket from '../assets/apparel-icons/bomber-jacket.png';
import vest from '../assets/apparel-icons/vest.png';
import trenchCoat from '../assets/apparel-icons/trench-coat.png';
import longSleeveTshirt from '../assets/apparel-icons/long-sleeve-tshirt.png';
import genericApparel from '../assets/apparel-icons/generic-apparel.png';

export const apparelIcons = [
  { key: 'tank-top', label: '背心', image: tankTop },
  { key: 'jacket', label: '夹克', image: jacket },
  { key: 'sweater', label: '毛衣', image: sweater },
  { key: 'tshirt', label: 'T恤', image: tshirt },
  { key: 'sleeveless-tshirt', label: '无袖T恤', image: sleevelessTshirt },
  { key: 'hooded-jacket', label: '带帽夹克', image: hoodedJacket },
  { key: 'shirt', label: '衬衫', image: shirt },
  { key: 'polo', label: 'Polo衫', image: polo },
  { key: 'sweatshirt', label: '卫衣', image: sweatshirt },
  { key: 'hoodie', label: '连帽卫衣', image: hoodie },
  { key: 'puffer-coat', label: '羽绒服', image: pufferCoat },
  { key: 'bomber-jacket', label: '飞行员夹克', image: bomberJacket },
  { key: 'vest', label: '马甲', image: vest },
  { key: 'trench-coat', label: '风衣', image: trenchCoat },
  { key: 'long-sleeve-tshirt', label: '长袖T恤', image: longSleeveTshirt },
  { key: 'generic-apparel', label: '通用服装', image: genericApparel },
];

const iconMap = new Map(apparelIcons.map((item) => [item.key, item]));

export function getApparelIcon(key) {
  if (key && typeof key === 'object' && key.key === 'custom' && typeof key.dataUrl === 'string' && key.dataUrl) {
    return { key: 'custom', label: key.label || '自定义图片', image: key.dataUrl };
  }
  if (typeof key === 'string' && key.startsWith('data:image/')) {
    return { key: 'custom', label: '自定义图片', image: key };
  }
  return iconMap.get(key) || iconMap.get('generic-apparel');
}
