import json, sys
seed = json.load(open(sys.argv[1]))
members = [{k: m[k] for k in ('id', 'name', 'fullName', 'role', 'avatar', 'color')} | {'haCalendarEntity': 'calendar.' + m['id']} for m in seed['members']]
cfg = {
    'familyName': 'Sandbox Family',
    'homeAssistant': {'url': 'http://ha.test:8123', 'token': 'sandbox-token'},
    'haGroceryTodoEntity': 'todo.groceries',
    'haMealIdeasEntity': 'todo.meal_ideas',
    'haMealPlanEntity': 'todo.weekly_meal_plan',
    'members': members,
}
print("(function(){var cfg = %s;" % json.dumps(cfg, ensure_ascii=False))
print("var q = location.search;")
print("if (q.indexOf('ha=off') >= 0) { delete cfg.homeAssistant; delete cfg.haGroceryTodoEntity; delete cfg.haMealIdeasEntity; delete cfg.haMealPlanEntity; cfg.members.forEach(function(m){ delete m.haCalendarEntity; }); }")
print("window.FAMILY_DASHBOARD_CONFIG = cfg; })();")
