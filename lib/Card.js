'use strict';

const debug = require('debug')('wechat-card');
const Promise = require('bluebird');
const isEmpty = require('lodash.isempty');

const util = require('./utils');
const config = require('./config');

const Store = require('./store/Store');
const FileStore = require('./store/FileStore');

const wxConfig = config.getDefaultConfiguration();

class Card {

  /**
   * Wechat Card/Coupons class
   * @constructor
   * @param options
   * @return {Card} Card instance
   */
  constructor (options) {

    config.checkPassedConfiguration(options);

    this.wechatConfig = isEmpty(options) ? wxConfig : Object.assign({}, wxConfig, options);

    if(!options.store || !(options.store instanceof Store)) {
      debug('Store not provided, using default FileStore...');
      this.store = new FileStore(options);
    } else {
      this.store = options.store;
    }

  }

  /**
   * Get Card api_ticket
   * @param {string} accessToken
   * @return {Promise}
   */
  getApiTicketRemotely (accessToken) {
    const params = {
      access_token: accessToken,
      type: 'wx_card',
    };
    return util.sendWechatRequest({
        url: this.wechatConfig.ticketUrl,
        qs: params,
      })
      .then(data => {
        data = Object.assign({modifyDate: new Date()}, data);
        delete data.errcode;
        delete data.errmsg;
        return this.store.updateCardTicket(data);
      })
      .catch((reason) => {
        debug('get card api_ticket failed!');
        return Promise.reject(reason);
      });
  }

  getApiTicket () {
    return this.store.getCardTicket()
      .then(ticketInfo => {
        if (ticketInfo.ticket && !util.isExpired(ticketInfo.modifyDate)) {
          return Promise.resolve(ticketInfo);
        }
        return this.store.getGlobalToken()
          .then(globalToken => {
            return Promise.reject(globalToken);
          });
      })
      .catch((globalToken) => {
        return this.getApiTicketRemotely(globalToken.accessToken);
      })
      ;
  }

  /**
   * Generate card signature info for chooseCard function
   * @param {string} shopId, aka: location_id
   * @param {string} cardType
   * @param {string} cardId
   * @return {Promise}
   */
  getCardSignature (shopId, cardType, cardId) {
    const infoForCardSign = {
      shopId: shopId || this.wechatConfig.shopId, //location_id
      cardType: cardType || this.wechatConfig.cardType,
      cardId: cardId || this.wechatConfig.cardId,
      timestamp: util.timestamp(),
      nonceStr: util.nonceStr(),
      // signType: 'SHA1',
      // cardSign: '',
      appid: this.wechatConfig.appId,
      api_ticket: '',
    };
    return this.getApiTicket()
      .then(ticketInfo => {
        infoForCardSign.api_ticket = ticketInfo.ticket;
        const values = Object.values(infoForCardSign);
        values.sort();
        infoForCardSign.cardSign = util.genSHA1(values.join(''));
        delete infoForCardSign.appid;
        delete infoForCardSign.api_ticket;
        return Promise.resolve(infoForCardSign);
      })
      .catch(reason => {
        return Promise.reject(reason);
      })
    ;
  }

  /**
   * Generate cardExt
   * @param {string=} cardId
   * @param {string=} code
   * @param {string=} openid
   * @param {string=} fixed_begintimestamp
   * @param {string=} outer_str
   * @return {Promise}
   */
  getCardExt (cardId, code, openid, fixed_begintimestamp, outer_str) {
    const infoForCardExt = {
      code: code || '',
      openid: openid || '',
      timestamp: util.timestamp(),
      nonce_str: util.nonceStr(),
      // fixed_begintimestamp: fixed_begintimestamp || '',
      // outer_str: outer_str || '',
      // signature: '',
    };
    return this.getApiTicket()
      .then(ticketInfo => {
        infoForCardExt.api_ticket = ticketInfo.ticket;
        const values = Object.values(infoForCardExt);
        cardId && values.push(cardId);
        infoForCardExt.signature = util.genSHA1(values.sort().join(''));
        fixed_begintimestamp && (infoForCardExt.fixed_begintimestamp = fixed_begintimestamp);
        outer_str && (infoForCardExt.outer_str = outer_str);
        delete infoForCardExt.api_ticket;
        return Promise.resolve(JSON.stringify(infoForCardExt));
      })
      .catch(reason => {
        return Promise.reject(reason);
      })
    ;

  }
}

module.exports = Card;