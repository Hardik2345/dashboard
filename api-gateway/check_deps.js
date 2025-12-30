try {
    require('express');
    console.log('express ok');
    require('supertest');
    console.log('supertest ok');
    require('mongodb-memory-server');
    console.log('mongo-mem ok');
    require('mongoose');
    console.log('mongoose ok');
} catch (e) {
    console.error(e);
}
