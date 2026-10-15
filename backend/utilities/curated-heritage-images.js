"use strict";

const CURATED_IMAGES = Object.freeze({
  "gateway-of-india": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Gateway_Of_India.jpg/1280px-Gateway_Of_India.jpg",
    wikimedia_filename: "Gateway Of India.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Gateway_Of_India.jpg",
    creator: "Joe Ravi",
    credit: "Photo by Joe Ravi",
    license: "CC BY-SA 3.0",
    license_url: "https://creativecommons.org/licenses/by-sa/3.0/",
    alt_text: "Gateway of India waterfront arch in Mumbai",
  },
  "elephanta-caves": {
    url: "https://upload.wikimedia.org/wikipedia/commons/4/41/Elephanta_Caves%2C_India.jpg",
    wikimedia_filename: "Elephanta Caves, India.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Elephanta_Caves,_India.jpg",
    creator: "Vyacheslav Argenberg",
    credit: "Photo by Vyacheslav Argenberg",
    license: "CC BY 4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    alt_text: "Interior of the Elephanta Caves",
  },
  "chhatrapati-shivaji-maharaj-terminus": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Chhatrapati_Shivaji_Terminus.jpg/1280px-Chhatrapati_Shivaji_Terminus.jpg",
    wikimedia_filename: "Chhatrapati Shivaji Terminus.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Chhatrapati_Shivaji_Terminus.jpg",
    creator: "Ondřej Žváček",
    credit: "Photo by Ondřej Žváček",
    license: "CC BY 2.5",
    license_url: "https://creativecommons.org/licenses/by/2.5/",
    alt_text: "Chhatrapati Shivaji Terminus in Mumbai",
  },
  "ajanta-caves": {
    url: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Ajanta_cave_no._9_2010.jpg",
    wikimedia_filename: "Ajanta cave no. 9 2010.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Ajanta_cave_no._9_2010.jpg",
    creator: "Marcin Białek",
    credit: "Photo by Marcin Białek",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    alt_text: "Facade of a rock-cut cave at Ajanta",
  },
  "ellora-caves": {
    url: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Ellora_Caves%2C_India%2C_Kailasanatha_Temple_2.jpg",
    wikimedia_filename: "Ellora Caves, India, Kailasanatha Temple 2.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Ellora_Caves,_India,_Kailasanatha_Temple_2.jpg",
    creator: "Vyacheslav Argenberg",
    credit: "Photo by Vyacheslav Argenberg",
    license: "CC BY 4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    alt_text: "Kailasanatha Temple at the Ellora Caves",
  },
  "bibi-ka-maqbara": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Bibi_ka_Maqbara_%28Taj_Mahal_of_Deccan%29.jpg/1280px-Bibi_ka_Maqbara_%28Taj_Mahal_of_Deccan%29.jpg",
    wikimedia_filename: "Bibi ka Maqbara (Taj Mahal of Deccan).jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Bibi_ka_Maqbara_(Taj_Mahal_of_Deccan).jpg",
    creator: "Rohit14400",
    credit: "Photo by Rohit14400",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    alt_text: "Bibi Ka Maqbara mausoleum in Maharashtra",
  },
  "daulatabad-fort": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Daulatabad_fort_ruins.JPG/1280px-Daulatabad_fort_ruins.JPG",
    wikimedia_filename: "Daulatabad fort ruins.JPG",
    source_url: "https://commons.wikimedia.org/wiki/File:Daulatabad_fort_ruins.JPG",
    creator: "Pamri",
    credit: "Photo by Pamri",
    license: "Public domain (author released)",
    license_url: "https://commons.wikimedia.org/wiki/Template:PD-self",
    alt_text: "Ruins at Daulatabad Fort",
  },
  "shaniwar-wada": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Shaniwar_Wada_Front_View-Pune-Maharashtra-N-MH-M64.jpg/1280px-Shaniwar_Wada_Front_View-Pune-Maharashtra-N-MH-M64.jpg",
    wikimedia_filename: "Shaniwar Wada Front View-Pune-Maharashtra-N-MH-M64.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Shaniwar_Wada_Front_View-Pune-Maharashtra-N-MH-M64.jpg",
    creator: "Subhodeep Mukherjee",
    credit: "Photo by Subhodeep Mukherjee",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    alt_text: "Front view of Shaniwar Wada in Pune",
  },
  "panhala-fort": {
    url: "https://upload.wikimedia.org/wikipedia/commons/7/77/Remotest_Rampart_on_Panhala.jpg",
    wikimedia_filename: "Remotest Rampart on Panhala.jpg",
    source_url: "https://commons.wikimedia.org/wiki/File:Remotest_Rampart_on_Panhala.jpg",
    creator: "Ankur P",
    credit: "Photo by Ankur P",
    license: "CC BY-SA 2.0",
    license_url: "https://creativecommons.org/licenses/by-sa/2.0/",
    alt_text: "Rampart at Panhala Fort",
  },
});

const CURATED_IMAGE_SLUGS_SQL = Object.keys(CURATED_IMAGES).map((slug) => `'${slug}'`).join(", ");

function hasVerifiedPublicImage(media) {
  return Array.isArray(media) && media.some((image) => {
    if (!image || image.media_type !== "image" || !["gallery", "current"].includes(image.media_role)) return false;
    if (image.verification_status !== "verified" || image.is_illustrative === true) return false;
    try {
      const url = new URL(String(image.url ?? ""));
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

function findVerifiedPublicImage(media) {
  return Array.isArray(media) ? media.find((image) => {
    if (!image || image.media_type !== "image" || !["gallery", "current"].includes(image.media_role)) return false;
    if (image.verification_status !== "verified" || image.is_illustrative === true) return false;
    try {
      const url = new URL(String(image.url ?? ""));
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }) : undefined;
}

function applyCuratedImageFallback(record) {
  if (!record || typeof record.slug !== "string") return record;
  const curated = CURATED_IMAGES[record.slug];
  const media = Array.isArray(record.media) ? record.media : [];
  if (hasVerifiedPublicImage(media)) {
    const image = findVerifiedPublicImage(media);
    return { ...record, image_url: record.image_url || image?.url || null, media };
  }
  if (!curated) return { ...record, media };

  return {
    ...record,
    image_url: curated.url,
    media: [{
      ...curated,
      media_type: "image",
      media_role: "current",
      media_context: "current",
      verification_status: "verified",
      is_illustrative: false,
      display_order: 0,
      provider: "wikimedia",
    }],
  };
}

module.exports = {
  CURATED_IMAGES,
  CURATED_IMAGE_SLUGS_SQL,
  applyCuratedImageFallback,
  findVerifiedPublicImage,
  hasVerifiedPublicImage,
};
