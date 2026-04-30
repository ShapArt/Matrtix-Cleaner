'use strict';

const DOCUMENT_TYPE_GROUP_A = [
  'Основной договор',
  'Перемена лица в обязательстве',
  'ДС на пролонгацию',
];

const DOCUMENT_TYPE_GROUP_B = [
  'ДС',
  'Спецификация',
  'Спецификация по качеству',
  'Соглашение о бонусах',
  'Перемена лица в обязательстве',
  'Соглашение о зачете',
  'Соглашение по ЭДО',
  'ДС к спецификации',
  'Заверение об обстоятельствах',
  'Соглашение о расторжении',
  'ДС на пролонгацию',
  'Соглашение о штрафах',
  'Уведомление о факторинге',
];

const CONDITION_PRESETS = {
  signing_standard: ['Тип = Расходная, ВН = Нет', 'Тип = Иное, ВН = Нет'],
  all: ['Тип = Все, ВН = Все'],
  income: ['Тип = Доходная, ВН = Нет'],
};

const EDO_PRESETS = {
  unified: ['Единый ЭДО'],
  nonUnified: ['Нет', 'ЭДО на внешней площадке'],
  all: ['Единый ЭДО', 'Нет', 'ЭДО на внешней площадке'],
};

const DEVELOPMENT_PROJECT_CATEGORIES = ['СМР', 'ПИР', 'Оборудование и запчасти'];

module.exports = {
  CONDITION_PRESETS,
  DEVELOPMENT_PROJECT_CATEGORIES,
  DOCUMENT_TYPE_GROUP_A,
  DOCUMENT_TYPE_GROUP_B,
  EDO_PRESETS,
};
