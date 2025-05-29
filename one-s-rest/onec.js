const { Object: COMObject } = require('winax');
var winax = require('winax');

function connect1C(userName, password, db_path) {
  v7 = new COMObject('V77.Application');
  let initParams = `/d ${db_path}`;
  if (userName) {
    initParams += ` /n "${userName}""`;
  }
  if (password) {
    initParams += ` /p "${password}""`;
  }

  const isConnected = v7.Initialize(v7.RMTrade, initParams, 'NO_SPLASH_SHOW');
  if (!isConnected) {
    console.error('❌ Не удалось подключиться к базе 1С.');
    return {
      v7: v7,
      connected: false 
    };
  }
  console.log('✅ Подключение к 1С установлено');
  return {
    v7: v7,
    connected: true 
  };
}

function disconnect1C(v7) {
  if (v7) {
    try {
      v7.ЗавершитьРаботуСистемы(1);
    } catch {
      console.log("v7 instance not completed in memory for inner clean up")
    }

    try {
      winax.release(v7);
      v7 = undefined;
      global.gc && global.gc();
      console.log('🧹 Подключение к 1С закрыто.');
    } catch (error) {
      console.error('⚠️ Ошибка при отключении от 1С:', error);
    }
  }
}

function openReportForm(v7, savePath, formPath) {
  if (!v7) {
    console.error('❌ Нет активного подключения к 1С. Сначала вызовите connect1C().');
    return;
  }
  if (!savePath) {
    console.error('❌ Не задан путь к папке сохрения отчета.');
    return;
  }
  if (!formPath) {
    console.error('❌ Не задан внешний модуль обработки 1С.');
    return;
  }

  try {
    const command = `ОткрытьФорму("Отчет", "${savePath}", "${formPath}")`;
    console.log(`📤 Выполняем команду ExecuteBatch`);
    const result = v7.ExecuteBatch(command);
    if (result === true) {
      console.log('✅ Внешняя форма отчета успешно открыта.');
    } else {
      console.error('❌ Ошибка при выполнении ExecuteBatch');
    }
  } catch (error) {
    console.error('❌ Ошибка при выполнении ExecuteBatch:', error);
  }
}

module.exports = {
  connect1C,
  disconnect1C,
  openReportForm
};