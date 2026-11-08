# Family Kitchen Dashboard

A wall-mounted display for one household: a shared calendar, a stars-based chores board for the kids, task boards for the parents, meal planning with a shopping list, weather, a photo screensaver and a doorbell popup. Everything the family enters is shared between its tablets through Home Assistant.

## Language

### People and places

**Member**:
A person in the household, either a kid or a parent, with a name, a colour, an icon and optionally a calendar.
_Avoid_: user, profile, account

**Kid**:
A member who earns stars.
_Avoid_: child

**Parent**:
A member who manages chores, prizes, tasks and settings, behind the Parent PIN.

**Tablet**:
One screen running the dashboard. Several tablets share the same household data.
_Avoid_: device, kiosk

**Household data**:
Everything the family has entered: missions, stars, prizes, tasks, their own events and the shared settings. All tablets show the same household data.
_Avoid_: state, database

**Baseline**:
The starting household data a tablet begins from, and what "Reset data" returns to.
_Avoid_: seed, default data

**Home Assistant**:
The home-automation server that holds the family's calendars, to-do lists, doorbell camera and the shared copy of the household data.

### Missions and stars

**Mission board**:
The Chores screen: each kid's missions side by side, with the wildcards and the Prize store beside them.
_Avoid_: chore chart

**Mission**:
Anything a kid checks off to earn stars: a routine, a chore or a wildcard.

**Routine**:
A one-star mission a kid checks off every day, grouped as Morning, After school or Bedtime. It earns at most one star a day.

**Chore**:
A mission with its own point value, owned by one kid, that resets daily, weekly or monthly.

**Cadence**:
How often a chore resets: daily, weekly (from Sunday) or monthly.
_Avoid_: frequency, schedule

**Wildcard**:
A bonus chore that belongs to no kid until one of them claims it. Only parents create or edit wildcards.
_Avoid_: bonus chore, shared chore

**Stars**:
A kid's balance. Missions earn them, the Prize store spends them, and a parent can adjust them by hand.
_Avoid_: points (points are what one mission is worth), coins

**Activity log**:
The recent stars a kid earned or spent, newest first. A parent's hand adjustment is not listed.
_Avoid_: history, streak

**Prize store**:
The prizes kids spend stars on. Buying one adds a to-do for the parents to hand it over.
_Avoid_: reward store, star jar, goal

**Prize**:
One item in the Prize store, with a star cost.
_Avoid_: reward

### Parents

**Parent PIN**:
The four-digit code that guards parent-only actions: adding and editing chores and prizes, the Manage panel and Settings. It is 1234 until a parent sets another.
_Avoid_: password, lock

**Parent task**:
A to-do on a parent's board with a priority, a theme and a due date. It can be shown on the calendar.
_Avoid_: reminder, ticket

**Repeating task**:
A parent task that moves to its next due date when it is done instead of finishing.
_Avoid_: recurring reminder

**Shared**:
Belonging to everyone rather than to one member, for example a task or event for the whole family.
_Avoid_: both

### Calendar

**Event**:
Something on a date, usually at a time. Events a member adds in the dashboard are their own; the rest come from members' calendars in Home Assistant.

**Merged event**:
The same event (same title, date and time) found on several members' calendars, shown once with a dot for each attendee.
_Avoid_: duplicate

**Member filter**:
Which member this tablet is showing: Everyone (Kids on the Mission board) or one person. Each tablet keeps its own.
_Avoid_: active member

### Meals

**Shopping list**:
The groceries to buy, kept in a Home Assistant to-do list that syncs with Google Keep.
_Avoid_: grocery list

**Meal idea**:
A saved dinner suggestion in the meal ideas library.

**Dinner plan**:
The dinners planned for the next seven days, one per weekday.
_Avoid_: meal plan, week plan

### Ambient screens

**Screensaver**:
The photo frame that takes over after the tablet has been idle: a photo with its caption, the clock, the weather and the rest of today's events.
_Avoid_: photo frame saver

**Night mode**:
The screen dimmed for the night, between set times or from sunset to sunrise. A tap brightens it until the tablet has been idle again.
_Avoid_: dark mode (that is the colour theme)

**Doorbell popup**:
The camera view that opens over everything when the doorbell is pressed.
