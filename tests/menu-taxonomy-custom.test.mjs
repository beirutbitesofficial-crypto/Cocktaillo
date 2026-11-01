import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupMenuTaxonomy} from '../lib/menu-taxonomy.js';
test('categories and subcategories added by staff survive cleanup before any item uses them',()=>{
 const s={menu:[{id:'a',name_en:'Latte',category:'Hot Beverage',subcategory:'Coffee'}],categories:[],subcategories:[],custom_categories:['Breakfast'],custom_subcategories:['Manakish']};
 cleanupMenuTaxonomy(s);
 assert.ok(s.categories.includes('Breakfast'));assert.ok(s.subcategories.includes('Manakish'));
 const t={menu:[],categories:['Old Empty'],subcategories:['Old Sub']};cleanupMenuTaxonomy(t);
 assert.ok(!t.categories.includes('Old Empty'),'empty categories that were never added on purpose are still cleaned up');
});
