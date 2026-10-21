/** Fictional place-style names for clubs. Each club takes a different one, so 80 are needed. */
export const CLUB_PLACES: readonly string[] = [
  'Aldwick', 'Ambergate', 'Ashby', 'Barrowby', 'Bexcombe', 'Birchwood', 'Blackmere', 'Bramley', 'Brackenfield',
  'Brindle', 'Broxholme', 'Calder', 'Carrow', 'Castlemoor', 'Chalkwell', 'Coldharbour', 'Cragside', 'Draycott',
  'Dunmore', 'Eastwold', 'Elmstead', 'Fenwick', 'Foxley', 'Garrow', 'Glenmoor', 'Greywater', 'Halstead',
  'Harrowgate', 'Hartley Vale', 'Holloway', 'Inglewood', 'Ironbridge', 'Jesmond Vale', 'Kelham', 'Kingsley',
  'Kirkby Moor', 'Larkhill', 'Linthorpe', 'Lowmoor', 'Lydbrook', 'Marlow', 'Mossley', 'Netherby', 'Northcote',
  'Oakenshaw', 'Oldmoor', 'Overton Cross', 'Pendle', 'Pickering Cross', 'Pinewood', 'Quarry Hill', 'Ravenscar',
  'Redmoor', 'Rushden Fields', 'Saltmarsh', 'Sandhurst Green', 'Shelford', 'Silverdale', 'Stanmoor', 'Thornhill',
  'Tranmere Heath', 'Ulverton', 'Upton Marsh', 'Vickers', 'Walcott', 'Westerby', 'Wexcombe', 'Whinfield',
  'Willowbeck', 'Winslow Green', 'Wrenbury', 'Yarrow', 'Yewdale', 'Ardleigh', 'Bellmoor', 'Cranbourne',
  'Dalesford', 'Evesham Brook', 'Fairmoor', 'Grimsdale', 'Hexworth', 'Ketterby', 'Lowick', 'Marsden Vale',
  'Norbury', 'Ormesby', 'Penhallow', 'Rothbury',
];

export const CLUB_SUFFIXES: readonly string[] = [
  'Town', 'United', 'Athletic', 'Rovers', 'Wanderers', 'City', 'Albion', 'Rangers', 'Dynamos', 'Borough',
];

export const GROUND_ENDINGS: readonly string[] = ['Park', 'Road', 'Lane', 'Ground', 'Field', 'Meadow', 'Stadium'];

/** Standalone ground names, used when a club does not take its name from its place. */
export const GROUND_NAMES: readonly string[] = [
  'The Brickworks', 'The Foundry', 'The Mill', 'The Orchard', 'The Quarry', 'The Hollow', 'The Common',
  'The Gasworks', 'The Cattle Market', 'The Showground', 'The Rec', 'The Wharf', 'The Allotments',
  'The Colliery', 'The Tannery', 'The Dell', 'The Paddock', 'The Cutting', 'The Sidings', 'The Pit',
];

export const FIRST_NAMES: readonly string[] = [
  'Jack', 'Luca', 'Mateo', 'Ollie', 'Rhys', 'Tomas', 'Kofi', 'Dan', 'Ezra', 'Callum', 'Idris', 'Nate', 'Soren',
  'Pavel', 'Gus', 'Remy', 'Hal', 'Stu', 'Ivo', 'Joss', 'Ben', 'Sam', 'Kai', 'Leo', 'Max', 'Finn', 'Theo',
  'Alfie', 'Reuben', 'Marcus', 'Dexter', 'Jory', 'Cal', 'Teo', 'Wes', 'Bruno', 'Eddie', 'Orrin', 'Mick', 'Lenny',
  'Joe', 'Tobi', 'Danny', 'Hugo', 'Felix', 'Paddy', 'Stefan', 'Deon', 'Ty', 'Rob', 'Iggy', 'Nico', 'Pablo',
  'Arlo', 'Beau', 'Cole', 'Drew', 'Elliot', 'Fraser', 'Gabe', 'Harvey', 'Isaac', 'Jonah', 'Kit', 'Liam',
  'Milo', 'Noah', 'Owen', 'Pip', 'Quinn', 'Rory', 'Seb', 'Toby', 'Uri', 'Vince', 'Will', 'Xavi', 'Yusuf',
  'Zac', 'Aled', 'Brodie', 'Carlos', 'Declan', 'Emeka', 'Fergus', 'Gareth', 'Hamza', 'Ian', 'Jamal', 'Kieran',
  'Lorcan', 'Mo', 'Niall', 'Ossie', 'Peter', 'Ravi', 'Sandy', 'Tariq',
];

export const LAST_NAMES: readonly string[] = [
  'Ashdown', 'Bellamy', 'Cartwright', 'Dolan', 'Ekwueme', 'Farrow', 'Gallagher', 'Hobbs', 'Imrie', 'Jessop',
  'Kowal', 'Lindqvist', 'Moss', 'Nwosu', 'Ogden', 'Pryce', 'Quinlan', 'Rudge', 'Sutcliffe', 'Thorne',
  'Underhill', 'Voss', 'Whelan', 'Yardley', 'Zielinski', 'Marsh', 'Oakes', 'Quill', 'Vask', 'Halloran',
  'Brindle', 'Soames', 'Pike', 'Fell', 'Treadwell', 'Vance', 'Zandt', 'Ibbotson', 'Marchetti', 'Penn', 'Alder',
  'Kessler', 'Maddox', 'Calloway', 'Sandhu', 'Teal', 'Brandt', 'Oyelaran', 'Rourke', 'Kroll', 'Whitcombe',
  'Ferreira', 'Abbott', 'Barlow', 'Cresswell', 'Dunne', 'Egan', 'Fitch', 'Garside', 'Hale', 'Ingram', 'Joyce',
  'Kemp', 'Lacey', 'Mallory', 'Nolan', 'Orme', 'Pardoe', 'Quigley', 'Rowe', 'Sharpe', 'Tulley', 'Upton',
  'Vickers', 'Wardle', 'Xavier', 'Yates', 'Zubair', 'Adeyemi', 'Brennan', 'Costa', 'Dyer', 'Eze', 'Fallon',
  'Grogan', 'Hargreaves', 'Iqbal', 'Jarvis', 'Khan', 'Lennox', 'Mbeki', 'Naylor', 'Okafor', 'Pascoe', 'Redfern',
  'Salt', 'Tennant', 'Udoka', 'Varley', 'Weller', 'Yeo', 'Ashworth', 'Bagshaw', 'Cullen', 'Doyle', 'Eastham',
  'Fenn', 'Gill', 'Holt', 'Irvine', 'Jolly', 'Knight', 'Latham', 'Mercer', 'Nash', 'Osei', 'Platt', 'Ramsey',
  'Stack', 'Tanner', 'Unwin', 'Venn', 'Wilde', 'Armitage', 'Burke', 'Crowe', 'Dale', 'Ellis', 'Foy', 'Gunn',
  'Hirst', 'Ince', 'Jago', 'Kerr', 'Lund', 'Mace', 'Noon', 'Oates',
];

export const INJURY_KINDS: readonly string[] = ['Hamstring', 'Ankle', 'Knee', 'Groin', 'Calf', 'Shoulder'];
