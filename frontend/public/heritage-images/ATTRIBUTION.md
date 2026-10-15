# Verified heritage photograph sources

These local copies correspond to verified catalogue photographs and are
selected by their exact Wikimedia Commons upload URLs. The backend also
provides a small curated public-media fallback for these four places and five
additional Maharashtra places when their production database media row is
missing. It returns the image URL and its source, creator, and license through
the existing public `image_url` and `media` fields. Explore checks that the
image loads before listing the place.

| Heritage place | Local file | Wikimedia Commons file page | Creator | Licence |
| --- | --- | --- | --- | --- |
| Ajanta Caves | `ajanta-caves.jpg` | [Ajanta cave no. 9 2010.jpg](https://commons.wikimedia.org/wiki/File:Ajanta_cave_no._9_2010.jpg) | Marcin Białek | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Elephanta Caves | `elephanta-caves.jpg` | [Elephanta Caves, India.jpg](https://commons.wikimedia.org/wiki/File:Elephanta_Caves,_India.jpg) | Vyacheslav Argenberg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Ellora Caves | `ellora-caves.jpg` | [Ellora Caves, India, Kailasanatha Temple 2.jpg](https://commons.wikimedia.org/wiki/File:Ellora_Caves,_India,_Kailasanatha_Temple_2.jpg) | Vyacheslav Argenberg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Panhala Fort | `panhala-fort.jpg` | [Remotest Rampart on Panhala.jpg](https://commons.wikimedia.org/wiki/File:Remotest_Rampart_on_Panhala.jpg) | Ankur P | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| Gateway of India | Wikimedia Commons thumbnail | [Gateway Of India.jpg](https://commons.wikimedia.org/wiki/File:Gateway_Of_India.jpg) | Joe Ravi | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Chhatrapati Shivaji Maharaj Terminus | Wikimedia Commons thumbnail | [Chhatrapati Shivaji Terminus.jpg](https://commons.wikimedia.org/wiki/File:Chhatrapati_Shivaji_Terminus.jpg) | Ondřej Žváček | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| Bibi Ka Maqbara | Wikimedia Commons thumbnail | [Bibi ka Maqbara (Taj Mahal of Deccan).jpg](https://commons.wikimedia.org/wiki/File:Bibi_ka_Maqbara_(Taj_Mahal_of_Deccan).jpg) | Rohit14400 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Daulatabad Fort | Wikimedia Commons thumbnail | [Daulatabad fort ruins.JPG](https://commons.wikimedia.org/wiki/File:Daulatabad_fort_ruins.JPG) | Pamri | Public domain (author released) |
| Shaniwar Wada | Wikimedia Commons thumbnail | [Shaniwar Wada Front View-Pune-Maharashtra-N-MH-M64.jpg](https://commons.wikimedia.org/wiki/File:Shaniwar_Wada_Front_View-Pune-Maharashtra-N-MH-M64.jpg) | Subhodeep Mukherjee | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The first four entries use the existing local image copies. The other five
are served from their matching Wikimedia Commons thumbnails. All nine exact
site mappings and public media fields are maintained in
`backend/utilities/curated-heritage-images.js`; no review-only candidate is
included there.
